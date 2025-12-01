import express from 'express';
import { createSupabaseClient } from '../supabase';
import { recalculateBalances } from '../utils/recalculate';

import { authMiddleware } from '../middleware/auth';

const router = express.Router();
router.use(authMiddleware);

router.get('/', async (req, res) => {
  const supabase = createSupabaseClient();
  const { data, error } = await supabase.from('transactions').select('*');
  
  if (error) return res.status(500).json({ error: error.message });
  
  const formatted = data.map((t: any) => ({
    ...t,
    friendId: t.friend_id
  }));

  res.json(formatted);
});

router.post('/settle-up', async (req, res) => {
  const { friendId, amount, type } = req.body;
  const supabase = createSupabaseClient();

  const { data, error } = await supabase
    .from('transactions')
    .insert([{
      friend_id: friendId,
      amount,
      type,
      date: new Date().toISOString()
    }])
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  await recalculateBalances(supabase);

  const formatted = {
    ...data,
    friendId: data.friend_id
  };

  res.status(201).json(formatted);
});

export default router;
