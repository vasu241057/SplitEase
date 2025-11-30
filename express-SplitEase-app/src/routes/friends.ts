import express from 'express';
import { createSupabaseClient } from '../supabase';

const router = express.Router();

router.get('/', async (req, res) => {
  const supabase = createSupabaseClient();
  const { data, error } = await supabase.from('friends').select('*');
  
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.post('/', async (req, res) => {
  const { name, email } = req.body;
  const supabase = createSupabaseClient();
  
  const { data, error } = await supabase
    .from('friends')
    .insert([{ name, email, balance: 0 }])
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

export default router;
