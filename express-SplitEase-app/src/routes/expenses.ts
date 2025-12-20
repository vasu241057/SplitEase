import express from 'express';
import { createSupabaseClient } from '../supabase';
import { recalculateBalances } from '../utils/recalculate';

import { authMiddleware } from '../middleware/auth';

const router = express.Router();
router.use(authMiddleware);

// Helper to check if ID is a Profile ID (User ID)
const isProfileId = async (supabase: any, id: string) => {
  if (!id || id === 'currentUser') return false;
  // Simple check: Try to select from profiles. 
  // Optimization: Cache this or assume UUID format distinction? 
  // But Friend IDs are also UUIDs.
  // We must check DB.
  const { data } = await supabase.from('profiles').select('id').eq('id', id).single();
  return !!data;
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

  // console.error(`[DEBUG] Found ${data?.length || 0} expenses for UserID: ${userId}`);
  // console.error(`[DEBUG] Raw Data:`, JSON.stringify(data, null, 2)); // Uncomment for verbose logs
  
  const formatted = data.map((e: any) => ({
    ...e,
    payerId: e.payer_user_id || e.payer_id || userId,
    groupId: e.group_id,
    splits: e.splits.map((s: any) => ({
      userId: s.user_id || s.friend_id || userId,
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
  const userId = (req as any).user.id;
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

  // Format
  const formatted = {
    ...e,
    payerId: e.payer_user_id || e.payer_id || userId, // Fallback might be wrong if viewer is not payer, but consistency with list
    groupId: e.group_id,
    splits: e.splits.map((s: any) => ({
      userId: s.user_id || s.friend_id || userId, // logic matches list
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
      recipientIds = expense.expense_splits.map((s: any) => s.user_id);
    }
    
    // Add Payer if not in splits (rare but possible)
    if (expense.payer_user_id) recipientIds.push(expense.payer_user_id);

    // Filter sender
    const currentUserId = req.user.id;
    recipientIds = recipientIds.filter(id => id !== currentUserId);
    recipientIds = [...new Set(recipientIds)];

    if (recipientIds.length === 0) return;

    // Get Sender Name
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', currentUserId)
      .single();
    
    const senderName = profile?.full_name || 'Someone';
    const title = `${senderName} ${action}`;
    
    let body = overrideBody;
    if (!body) {
        if (action.includes('added')) {
             body = `${senderName} added an expense of ₹${expense.amount} for '${expense.description}'`;
        } else {
             body = expense.description || 'Expense details';
        }
    }
    
    // Fix: Deep link must match Frontend Route /expenses/:id
    const url = `/expenses/${expenseId}`;

    console.log(`[Expenses] Notifying participants. Sender: ${senderName}, Action: ${action}`);
    console.log(`[Expenses] Recipients: ${JSON.stringify(recipientIds)}`);
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
  // 1. Prepare Splits (Async Logic for ID resolution)
  const preparedSplits = await Promise.all(splits.map(async (s: any) => ({
    user_id: s.userId === 'currentUser' ? (req as any).user.id : (await isProfileId(supabase, s.userId) ? s.userId : null),
    friend_id: s.userId === 'currentUser' ? null : (await isProfileId(supabase, s.userId) ? null : s.userId),
    amount: s.amount,
    paid_amount: s.paidAmount || 0,
    paid: s.paid || false
  })));

  const rpcParams = {
    p_description: description,
    p_amount: amount,
    p_date: date || new Date().toISOString(),
    p_payer_id: payerId === 'currentUser' ? null : (await isProfileId(supabase, payerId) ? null : payerId),
    p_payer_user_id: payerId === 'currentUser' ? (req as any).user.id : (await isProfileId(supabase, payerId) ? payerId : null),
    p_group_id: groupId,
    p_created_by: creatorUserId,
    p_splits: preparedSplits
  };

  const { data: expenseRecord, error: rpcError } = await supabase.rpc('create_expense_with_splits', rpcParams);

  if (rpcError) return res.status(500).json({ error: rpcError.message });
  
  // Cast to expected shape (RPC returns JSONB which loses some type info, but runtime checks are fine)
  const expense: any = expenseRecord;
  expense.splits = preparedSplits; // Ensure local consistency if needed for logic below (Wait, RPC returns expense only?)
  // RPC returns expense record. Does it return splits? Current SQL returns `v_expense_record`.
  // RecalculateBalances does its own fetch.
  // But line 274: `const newExpense = { ...expense, splits }`. It uses the `splits` from request body (original).
  // So validation holds.

  console.log('[BALANCE_DEBUG] Expense atomic creation successful. ID:', expense.id);
  console.log('[BALANCE_DEBUG] ===== TRIGGERING RECALCULATE BALANCES =====');

  try {
    await recalculateBalances(supabase);
    console.log('[BALANCE_DEBUG] RecalculateBalances completed successfully');
  } catch (e: any) {
     console.error('[BALANCE_DEBUG] Error in recalculateBalances:', e); 
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
  const { description, amount, date, payerId, splits, groupId } = req.body;
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


  const { error: expenseError } = await supabase
    .from('expenses')
    .update({
      description,
      amount,
      date,
      payer_id: payerId === 'currentUser' ? null : (await isProfileId(supabase, payerId) ? null : payerId),
      payer_user_id: payerId === 'currentUser' ? (req as any).user.id : (await isProfileId(supabase, payerId) ? payerId : null),
      group_id: groupId
    })
    .eq('id', id);

  if (expenseError) return res.status(500).json({ error: expenseError.message });

  // ...
  
  const { error: deleteError } = await supabase
    .from('expense_splits')
    .delete()
    .eq('expense_id', id);

  if (deleteError) return res.status(500).json({ error: deleteError.message });

  const splitInserts = await Promise.all(splits.map(async (s: any) => ({
    expense_id: id,
    friend_id: s.userId === 'currentUser' ? null : (await isProfileId(supabase, s.userId) ? null : s.userId),
    user_id: s.userId === 'currentUser' ? (req as any).user.id : (await isProfileId(supabase, s.userId) ? s.userId : null),
    amount: s.amount,
    paid_amount: s.paidAmount || 0,
    paid: s.paid || false
  })));
  
  const { error: splitError } = await supabase
    .from('expense_splits')
    .insert(splitInserts);
    
  if (splitError) return res.status(500).json({ error: splitError.message });

  await recalculateBalances(supabase);

  // Notify
  await notifyExpenseParticipants(req, id, 'updated an expense', `${description} was updated`);

  res.json({ id, description, amount, date, payerId, splits, groupId });
});

router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const supabase = createSupabaseClient();

  // Notify BEFORE deletion/hiding, so we can still fetch details.
  // Actually we just mark as deleted, so fetching is fine.
  
  const { error } = await supabase
    .from('expenses')
    .update({ deleted: true })
    .eq('id', id);

  if (error) return res.status(500).json({ error: error.message });

  await recalculateBalances(supabase);

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

  const { error } = await supabase
    .from('expenses')
    .update({ deleted: false })
    .eq('id', id);

  if (error) return res.status(500).json({ error: error.message });

  await recalculateBalances(supabase);

  const { data } = await supabase.from('expenses').select('*').eq('id', id).single();
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
