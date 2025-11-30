import express from 'express';
import { createSupabaseClient } from '../supabase';
import { recalculateBalances } from '../utils/recalculate';

const router = express.Router();

router.get('/', async (req, res) => {
  const supabase = createSupabaseClient();
  const { data, error } = await supabase
    .from('expenses')
    .select('*, splits:expense_splits(*)')
    .order('date', { ascending: false });
    
  if (error) return res.status(500).json({ error: error.message });
  
  const formatted = data.map((e: any) => ({
    ...e,
    payerId: e.payer_id || 'currentUser',
    groupId: e.group_id,
    splits: e.splits.map((s: any) => ({
      userId: s.friend_id || 'currentUser',
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
      payer_id: payerId === 'currentUser' ? null : payerId,
      group_id: groupId,
      deleted: false
    }])
    .select()
    .single();

  if (expenseError) return res.status(500).json({ error: expenseError.message });

  const splitInserts = splits.map((s: any) => ({
    expense_id: expense.id,
    friend_id: s.userId === 'currentUser' ? null : s.userId,
    amount: s.amount,
    paid_amount: s.paidAmount || 0,
    paid: s.paid || false
  }));

  const { error: splitError } = await supabase
    .from('expense_splits')
    .insert(splitInserts);

  if (splitError) return res.status(500).json({ error: splitError.message });

  try {
    await recalculateBalances(supabase);
  } catch (e: any) {
    console.error('Error recalculating balances:', e);
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
      payer_id: payerId === 'currentUser' ? null : payerId,
      group_id: groupId
    })
    .eq('id', id);

  if (expenseError) return res.status(500).json({ error: expenseError.message });

  const { error: deleteError } = await supabase
    .from('expense_splits')
    .delete()
    .eq('expense_id', id);

  if (deleteError) return res.status(500).json({ error: deleteError.message });

  const splitInserts = splits.map((s: any) => ({
    expense_id: id,
    friend_id: s.userId === 'currentUser' ? null : s.userId,
    amount: s.amount,
    paid_amount: s.paidAmount || 0,
    paid: s.paid || false
  }));

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
