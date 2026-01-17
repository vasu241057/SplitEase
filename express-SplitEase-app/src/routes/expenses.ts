import express from 'express';
import { createSupabaseClient } from '../supabase';
import { recalculateGroupBalances, recalculateUserPersonalLedger } from '../utils/recalculate';
import { validateExpenseParticipantsAreMembers } from '../utils/expenseValidation';

import { authMiddleware } from '../middleware/auth';

const router = express.Router();
router.use(authMiddleware);

// === STEP 2 INVARIANT: UserID-Only Expense Creation ===
// For all NEW expenses (create/update):
// - expense_splits.user_id is REQUIRED (must be a valid global profiles.id)
// - expense_splits.friend_id MUST always be NULL
// - expenses.payer_user_id is REQUIRED
// - expenses.payer_id MUST always be NULL
// After Step 5 backfill, ALL data has user_id populated. No fallbacks.

// Helper to validate all splits have valid user_id (Step 2 invariant)
const validateUserIdOnlySplits = (splits: any[]): { valid: boolean; error?: string } => {
  for (const split of splits) {
    if (!split.user_id) {
      return { 
        valid: false, 
        error: 'Invalid expense payload: all participants must have a valid global user ID (user_id is required)'
      };
    }
    if (split.friend_id !== null && split.friend_id !== undefined) {
      return { 
        valid: false, 
        error: 'Invalid expense payload: friend_id is not allowed for new expenses (must use user_id only)'
      };
    }
  }
  return { valid: true };
};

// =============================================================================
// DEPRECATED: Helper to extract 2 participants from personal expense splits
// =============================================================================
// This helper assumes EXACTLY 2 participants and is no longer used.
// All personal expense recalculation now uses recalculateUserPersonalLedger.
//
// STATUS: UNUSED - Kept for reference only
// CLEANUP: This function will be deleted in a future cleanup prompt
// =============================================================================
const getPersonalExpenseParticipants = (splits: any[], payerId: string): [string, string] | null => {
  const participants = new Set<string>();
  
  // Add payer
  if (payerId && payerId !== 'currentUser') {
    participants.add(payerId);
  }
  
  // Add split participants
  splits?.forEach((split: any) => {
    const userId = split.user_id || split.userId;
    if (userId && userId !== 'currentUser') {
      participants.add(userId);
    }
  });
  
  // Return exactly 2 participants for scoped recalculation
  const participantArray = Array.from(participants);
  if (participantArray.length === 2) {
    return [participantArray[0], participantArray[1]];
  }
  return null; // Not exactly 2 participants
};

router.get('/', async (req, res) => {
  const userId = (req as any).user.id;
  
  const supabase = createSupabaseClient();
  
  // Use RPC to filter expenses relevant to the user
  const { data, error } = await supabase
    .rpc('get_user_expenses', { current_user_id: userId })
    .select('*, splits:expense_splits(*)')
    .order('date', { ascending: false });
    
  if (error) {
    return res.status(500).json({ error: error.message });
  }
  
  // INVARIANT: All expenses have payer_user_id and all splits have user_id (enforced after Step 5 backfill)
  const formatted = data.map((e: any) => ({
    ...e,
    payerId: e.payer_user_id, // Strict: no fallback
    groupId: e.group_id,
    splits: e.splits.map((s: any) => ({
      userId: s.user_id, // Strict: no fallback
      amount: s.amount,
      paidAmount: s.paid_amount,
      paid: s.paid
    }))
  }));

  res.json(formatted);
});

// GET Single Expense
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  const supabase = createSupabaseClient();

  // Fetch expense with splits
  const { data: e, error } = await supabase
    .from('expenses')
    .select('*, splits:expense_splits(*)')
    .eq('id', id)
    .single();

  if (error || !e) {
    return res.status(404).json({ error: 'Expense not found' });
  }

  // INVARIANT: All expenses have payer_user_id and all splits have user_id
  const formatted = {
    ...e,
    payerId: e.payer_user_id, // Strict: no fallback
    groupId: e.group_id,
    splits: e.splits.map((s: any) => ({
      userId: s.user_id, // Strict: no fallback
      amount: s.amount,
      paidAmount: s.paid_amount,
      paid: s.paid
    }))
  };

  res.json(formatted);
});

// Helper to notify participants
const notifyExpenseParticipants = async (
  req: any,
  expenseId: string,
  action: string,
  overrideBody?: string
) => {
  const envKey = process.env as any;
  const env = {
      SUPABASE_URL: envKey.SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: envKey.SUPABASE_SERVICE_ROLE_KEY,
      VAPID_PUBLIC_KEY: envKey.VAPID_PUBLIC_KEY,
      VAPID_PRIVATE_KEY: envKey.VAPID_PRIVATE_KEY,
      VAPID_SUBJECT: envKey.VAPID_SUBJECT
  };

  if (!env.VAPID_PUBLIC_KEY) return;

  try {
    const supabase = createSupabaseClient();
    const { data: expense } = await supabase
      .from('expenses')
      .select('*, expense_splits(*)')
      .eq('id', expenseId)
      .single();

    if (!expense) return;

    let recipientIds: string[] = [];
    if (expense.expense_splits) {
      // Collect user_ids directly from splits
      const directUserIds = expense.expense_splits
        .map((s: any) => s.user_id)
        .filter((id: string | null) => id !== null);
      
      // For friend_id entries, lookup linked_user_id from friends table
      const friendIds = expense.expense_splits
        .map((s: any) => s.friend_id)
        .filter((id: string | null) => id !== null);
      
      if (friendIds.length > 0) {
        const { data: friends } = await supabase
          .from('friends')
          .select('linked_user_id')
          .in('id', friendIds);
        
        if (friends) {
          const linkedUserIds = friends
            .map((f: any) => f.linked_user_id)
            .filter((id: string | null) => id !== null);
          recipientIds = [...directUserIds, ...linkedUserIds];
        } else {
          recipientIds = directUserIds;
        }
      } else {
        recipientIds = directUserIds;
      }
    }
    
    // Add Payer if not in splits (rare but possible)
    if (expense.payer_user_id) recipientIds.push(expense.payer_user_id);

    // Filter sender and remove duplicates
    const currentUserId = req.user.id;
    recipientIds = recipientIds.filter(id => id && id !== currentUserId);
    recipientIds = [...new Set(recipientIds)];

    if (recipientIds.length === 0) return;

    // Get Sender Name
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', currentUserId)
      .single();
    
    const senderName = profile?.full_name || 'Someone';
    
    // Get group name for context (if group expense)
    let context = '';
    if (expense.group_id) {
      const { data: group } = await supabase
        .from('groups')
        .select('name')
        .eq('id', expense.group_id)
        .single();
      context = group?.name || '';
    }
    
    // Redesigned notification templates
    let title = '';
    let body = overrideBody;
    
    if (action.includes('added')) {
      title = `₹${expense.amount} added 💸`;
      body = body || (context 
        ? `${senderName} • "${expense.description}" in ${context}`
        : `${senderName} • "${expense.description}"`);
    } else if (action.includes('deleted')) {
      title = `Expense deleted`;
      body = body || `${senderName} removed "${expense.description}"`;
    } else if (action.includes('restored')) {
      title = `Expense restored`;
      body = body || `${senderName} restored "${expense.description}"`;
    } else if (action.includes('updated')) {
      title = `Expense updated`;
      body = body || `${senderName} updated "${expense.description}"`;
    } else {
      // Fallback
      title = `Expense activity`;
      body = body || expense.description || 'Expense details';
    }
    
    // Fix: Deep link must match Frontend Route /expenses/:id
    const url = `/expenses/${expenseId}`;

    console.log(`[Expenses] Notifying participants. Sender: ${senderName}, Action: ${action}`);
    console.log(`[Expenses] Recipients: ${JSON.stringify(recipientIds)}`)
    console.log(`[Expenses] Payload: Title="${title}", Body="${body}", URL="${url}"`);

    const { sendPushNotification } = await import('../utils/push');
    await sendPushNotification(env, recipientIds, title, body || 'New Activity', url);

  } catch (error) {
    console.error('Failed to send expense notification:', error);
  }
};

router.post('/', async (req, res) => {
  const { description, amount, date, payerId, splits, groupId } = req.body;
  const supabase = createSupabaseClient();
  
  // === FIX: Validate expense integrity ===
  const TOLERANCE = 0.01;
  
  // 1. Amount must be positive
  if (typeof amount !== 'number' || amount <= 0) {
    return res.status(400).json({ error: "Expense amount must be a positive number." });
  }
  
  // 2. Splits must exist
  if (!Array.isArray(splits) || splits.length === 0) {
    return res.status(400).json({ error: "Expense must have at least one split." });
  }
  
  // 3. All split amounts must be non-negative
  const hasNegativeSplit = splits.some((s: any) => (s.amount || 0) < 0);
  if (hasNegativeSplit) {
    return res.status(400).json({ error: "Split amounts cannot be negative." });
  }
  
  // 4. Sum of splits must equal expense amount
  const splitSum = splits.reduce((sum: number, s: any) => sum + (s.amount || 0), 0);
  if (Math.abs(splitSum - amount) > TOLERANCE) {
    return res.status(400).json({ 
      error: `Split amounts (${splitSum.toFixed(2)}) must equal expense amount (${amount.toFixed(2)}).` 
    });
  }
  // 5. Sum of paid amounts must equal expense amount
  const paidSum = splits.reduce((sum: number, s: any) => sum + (s.paidAmount || 0), 0);
  if (Math.abs(paidSum - amount) > TOLERANCE) {
    return res.status(400).json({ 
      error: `Total paid amount (${paidSum.toFixed(2)}) must equal expense amount (${amount.toFixed(2)}).` 
    });
  }
  // === END validation ===

  
  const creatorUserId = (req as any).user?.id;
  
  // ===== DEBUG LOG: Expense Creation Start =====
  console.log('[BALANCE_DEBUG] ===== EXPENSE CREATION START =====');
  console.log('[BALANCE_DEBUG] Creator User ID:', creatorUserId);
  console.log('[BALANCE_DEBUG] Expense Details:', {
    description,
    amount,
    date,
    payerId,
    groupId,
    splitsCount: splits?.length
  });
  console.log('[BALANCE_DEBUG] Splits to be created:', JSON.stringify(splits, null, 2));
  
  // === ATOMIC RPC CALL ===
  // 1. Prepare Splits - STRICT userId-only enforcement (Step 2 Invariant)
  // Frontend MUST send valid global userIds. No friend_id fallback.
  const preparedSplits = splits.map((s: any) => {
    // Resolve 'currentUser' to actual user ID
    const resolvedUserId = s.userId === 'currentUser' ? (req as any).user.id : s.userId;
    
    return {
      user_id: resolvedUserId,
      friend_id: null, // Step 2 Invariant: NEVER persist friend_id for new expenses
      amount: s.amount,
      paid_amount: s.paidAmount || 0,
      paid: s.paid || false
    };
  });

  // STEP 2 INVARIANT: Validate all splits have user_id and no friend_id
  const splitValidation = validateUserIdOnlySplits(preparedSplits);
  if (!splitValidation.valid) {
    console.error('[STEP2_INVARIANT_VIOLATION]', splitValidation.error);
    return res.status(400).json({ error: splitValidation.error });
  }

  // Resolve payer ID - Step 2 Invariant: payer MUST have user_id
  const resolvedPayerUserId = payerId === 'currentUser' ? (req as any).user.id : payerId;
  if (!resolvedPayerUserId) {
    console.error('[STEP2_INVARIANT_VIOLATION] Payer user_id is required');
    return res.status(400).json({ 
      error: 'Invalid expense payload: payer must have a valid global user ID (payer_user_id is required)' 
    });
  }

  const rpcParams = {
    p_description: description,
    p_amount: amount,
    p_date: date || new Date().toISOString(),
    p_payer_id: null, // Step 2 Invariant: NEVER persist friend_id for payer
    p_payer_user_id: resolvedPayerUserId,
    p_group_id: groupId || null,
    p_created_by: creatorUserId,
    p_splits: preparedSplits
  };

  const { data: expenseRecord, error: rpcError } = await supabase.rpc('create_expense_with_splits', rpcParams);

  if (rpcError) {
    return res.status(500).json({ error: rpcError.message });
  }
  
  // Cast to expected shape (RPC returns JSONB which loses some type info, but runtime checks are fine)
  const expense: any = expenseRecord;
  expense.splits = preparedSplits; 
  
  console.log('[BALANCE_DEBUG] Expense atomic creation successful. ID:', expense.id);
  console.log('[BALANCE_DEBUG] ===== TRIGGERING RECALCULATE BALANCES =====');

  try {
    if (groupId) {
        await recalculateGroupBalances(supabase, groupId);
    } else {
        // Personal expense: N-person support via user ledger recalculation
        await recalculateUserPersonalLedger(supabase, creatorUserId);
    }
    console.log('[BALANCE_DEBUG] RecalculateBalances completed successfully');
  } catch (e: any) {
     console.error('[BALANCE_DEBUG] Error in recalculation:', e);
     // Surface error to client - do NOT swallow
     return res.status(500).json({ error: `Balance recalculation failed: ${e.message}` });
  }
  
  console.log('[BALANCE_DEBUG] ===== EXPENSE CREATION END =====');

  const newExpense = {
    ...expense,
    payerId,
    groupId,
    splits
  };

  // System Comment
  await supabase.from('comments').insert({
    entity_type: 'expense',
    entity_id: expense.id,
    user_id: (req as any).user.id,
    content: 'created this expense',
    is_system: true
  });

  // Notify
  await notifyExpenseParticipants(req, expense.id, 'added an expense');

  res.status(201).json(newExpense);
});

router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { description, amount, date, payerId, splits, groupId, splitMode } = req.body;
  const supabase = createSupabaseClient();

  // === FIX: Validate expense integrity (same as POST) ===
  const TOLERANCE = 0.01;
  
  if (typeof amount !== 'number' || amount <= 0) {
    return res.status(400).json({ error: "Expense amount must be a positive number." });
  }
  
  if (!Array.isArray(splits) || splits.length === 0) {
    return res.status(400).json({ error: "Expense must have at least one split." });
  }
  
  const hasNegativeSplit = splits.some((s: any) => (s.amount || 0) < 0);
  if (hasNegativeSplit) {
    return res.status(400).json({ error: "Split amounts cannot be negative." });
  }
  
  const splitSum = splits.reduce((sum: number, s: any) => sum + (s.amount || 0), 0);
  if (Math.abs(splitSum - amount) > TOLERANCE) {
    return res.status(400).json({ 
      error: `Split amounts (${splitSum.toFixed(2)}) must equal expense amount (${amount.toFixed(2)}).` 
    });
  }
  // 5. Sum of paid amounts must equal expense amount
  const paidSum = splits.reduce((sum: number, s: any) => sum + (s.paidAmount || 0), 0);
  if (Math.abs(paidSum - amount) > TOLERANCE) {
    return res.status(400).json({ 
      error: `Total paid amount (${paidSum.toFixed(2)}) must equal expense amount (${amount.toFixed(2)}).` 
    });
  }
  // === END validation ===

  // === Validate participants are still group members ===
  if (groupId) {
    const validation = await validateExpenseParticipantsAreMembers(supabase, id, groupId);
    if (!validation.valid) {
      return res.status(400).json({
        error: "Cannot edit expense: Some participants have left the group. Re-add them first or delete and recreate the expense.",
        exitedParticipants: validation.exitedParticipants
      });
    }
  }

  // Prepare Splits for RPC - STRICT userId-only enforcement
  // Frontend MUST send valid global userIds. No more friend_id fallback.
  const preparedSplits = splits.map((s: any) => {
    // Resolve 'currentUser' to actual user ID
    const resolvedUserId = s.userId === 'currentUser' ? (req as any).user.id : s.userId;
    
    return {
      user_id: resolvedUserId,
      friend_id: null, // Step 2 Invariant: NEVER persist friend_id for new/updated expenses
      amount: s.amount,
      paid_amount: s.paidAmount || 0,
      paid: s.paid || false
    };
  });

  // STEP 2 INVARIANT: Validate all splits have user_id and no friend_id
  const splitValidation = validateUserIdOnlySplits(preparedSplits);
  if (!splitValidation.valid) {
    console.error('[STEP2_INVARIANT_VIOLATION]', splitValidation.error);
    return res.status(400).json({ error: splitValidation.error });
  }

  // Resolve payer ID - Step 2 Invariant: payer MUST have user_id
  const resolvedPayerUserId = payerId === 'currentUser' ? (req as any).user.id : payerId;
  if (!resolvedPayerUserId) {
    console.error('[STEP2_INVARIANT_VIOLATION] Payer user_id is required');
    return res.status(400).json({ 
      error: 'Invalid expense payload: payer must have a valid global user ID (payer_user_id is required)' 
    });
  }

  const rpcParams = {
    p_expense_id: id,
    p_description: description,
    p_amount: amount,
    p_date: date,
    p_payer_id: null, // Step 2 Invariant: NEVER persist friend_id for payer
    p_payer_user_id: resolvedPayerUserId,
    p_group_id: groupId,
    p_split_mode: splitMode || null, // Allow null for backward compat
    p_splits: preparedSplits
  };

  const { error: rpcError } = await supabase.rpc('update_expense_with_splits', rpcParams);

  if (rpcError) {
    return res.status(500).json({ error: rpcError.message });
  }

  if (groupId) {
    await recalculateGroupBalances(supabase, groupId);
  } else {
    // Personal expense: N-person support via user ledger recalculation
    const currentUserId = (req as any).user.id;
    try {
      await recalculateUserPersonalLedger(supabase, currentUserId);
    } catch (e: any) {
      return res.status(500).json({ error: `Balance recalculation failed: ${e.message}` });
    }
  }

  // Notify
  await notifyExpenseParticipants(req, id, 'updated an expense', `${description} was updated`);

  res.json({ id, description, amount, date, payerId, splits, groupId, splitMode });
});

router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const supabase = createSupabaseClient();

  // Fetch expense info before update to know the Group ID for scoped recalc
  const { data: expenseBefore } = await supabase.from('expenses').select('group_id, payer_user_id, payer_id').eq('id', id).single();
  const groupId = expenseBefore?.group_id;

  // Validate participants are still group members
  if (groupId) {
    const validation = await validateExpenseParticipantsAreMembers(supabase, id, groupId);
    if (!validation.valid) {
      return res.status(400).json({
        error: "Cannot delete expense: Some participants have left the group. Re-add them first.",
        exitedParticipants: validation.exitedParticipants
      });
    }
  }

  const { error } = await supabase
    .from('expenses')
    .update({ deleted: true })
    .eq('id', id);

  if (error) return res.status(500).json({ error: error.message });

  if (groupId) {
    await recalculateGroupBalances(supabase, groupId);
  } else {
    // Personal expense: N-person support via user ledger recalculation
    const currentUserId = (req as any).user.id;
    try {
      await recalculateUserPersonalLedger(supabase, currentUserId);
    } catch (e: any) {
      console.error('[DELETE_EXPENSE_RECALC_FAILED]', {
        expenseId: id,
        userId: currentUserId,
        error: e.message,
        stack: e.stack?.split('\n').slice(0, 5),
      });
      return res.status(500).json({ error: `Balance recalculation failed: ${e.message}` });
    }
  }

  // System Comment
  await supabase.from('comments').insert({
    entity_type: 'expense',
    entity_id: id,
    user_id: (req as any).user.id,
    content: 'deleted this expense',
    is_system: true
  });

  // Notify
  await notifyExpenseParticipants(req, id, 'deleted an expense');

  res.json({ message: "Expense deleted successfully" });
});

router.post('/:id/restore', async (req, res) => {
  const { id } = req.params;
  const supabase = createSupabaseClient();

  // Fetch expense BEFORE restore to get group_id and validate
  const { data: expenseBefore } = await supabase.from('expenses').select('*').eq('id', id).single();
  const groupId = expenseBefore?.group_id;

  // Validate participants are still group members
  if (groupId) {
    const validation = await validateExpenseParticipantsAreMembers(supabase, id, groupId);
    if (!validation.valid) {
      return res.status(400).json({
        error: "Cannot restore expense: Some participants have left the group. Re-add them first.",
        exitedParticipants: validation.exitedParticipants
      });
    }
  }

  const { error } = await supabase
    .from('expenses')
    .update({ deleted: false })
    .eq('id', id);

  if (error) return res.status(500).json({ error: error.message });

  // Fetch updated data for response
  const { data } = await supabase.from('expenses').select('*').eq('id', id).single();

  if (groupId) {
    await recalculateGroupBalances(supabase, groupId);
  } else {
    // Personal expense: N-person support via user ledger recalculation
    const currentUserId = (req as any).user.id;
    try {
      await recalculateUserPersonalLedger(supabase, currentUserId);
    } catch (e: any) {
      console.error('[RESTORE_EXPENSE_RECALC_FAILED]', {
        expenseId: id,
        userId: currentUserId,
        error: e.message,
        stack: e.stack?.split('\n').slice(0, 5),
      });
      return res.status(500).json({ error: `Balance recalculation failed: ${e.message}` });
    }
  }

  // System Comment
  await supabase.from('comments').insert({
    entity_type: 'expense',
    entity_id: id,
    user_id: (req as any).user.id,
    content: 'restored this expense',
    is_system: true
  });

  // Notify
  await notifyExpenseParticipants(req, id, 'restored an expense');

  res.json(data);
});

export default router;
