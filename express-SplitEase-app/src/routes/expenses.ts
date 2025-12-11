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
  console.error(`[DEBUG] Fetching expenses for UserID: ${userId}`);
  
  const supabase = createSupabaseClient();
  
  // Use RPC to filter expenses relevant to the user
  const { data, error } = await supabase
    .rpc('get_user_expenses', { current_user_id: userId })
    .select('*, splits:expense_splits(*)')
    .order('date', { ascending: false });
    
  if (error) {
    console.error(`[DEBUG] Error fetching expenses for UserID ${userId}:`, error.message);
    return res.status(500).json({ error: error.message });
  }

  console.error(`[DEBUG] Found ${data?.length || 0} expenses for UserID: ${userId}`);
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

router.post('/', async (req, res) => {
  const { description, amount, date, payerId, splits, groupId } = req.body;
  const supabase = createSupabaseClient();
  
  const { data: expense, error: expenseError } = await supabase
    .from('expenses')
    .insert([{
      description,
      amount,
      date: date || new Date().toISOString(),
      payer_id: payerId === 'currentUser' ? null : (await isProfileId(supabase, payerId) ? null : payerId),
      payer_user_id: payerId === 'currentUser' ? (req as any).user.id : (await isProfileId(supabase, payerId) ? payerId : null),
      group_id: groupId,
      deleted: false
    }])
    .select()
    .single();

  if (expenseError) return res.status(500).json({ error: expenseError.message });

  const splitInserts = await Promise.all(splits.map(async (s: any) => ({
    expense_id: expense.id,
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

  try {
    await recalculateBalances(supabase);
  } catch (e: any) {
     // console.error('Error recalculating balances:', e); 
  }

  const newExpense = {
    ...expense,
    payerId,
    groupId,
    splits
  };

  res.status(201).json(newExpense);
});

router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { description, amount, date, payerId, splits, groupId } = req.body;
  const supabase = createSupabaseClient();

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

  res.json({ id, description, amount, date, payerId, splits, groupId });
});

router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const supabase = createSupabaseClient();

  const { error } = await supabase
    .from('expenses')
    .update({ deleted: true })
    .eq('id', id);

  if (error) return res.status(500).json({ error: error.message });

  await recalculateBalances(supabase);

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
  res.json(data);
});

export default router;
