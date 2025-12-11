import express from 'express';
import { createSupabaseClient } from '../supabase';
import { recalculateBalances } from '../utils/recalculate';

import { authMiddleware } from '../middleware/auth';

const router = express.Router();
router.use(authMiddleware);

router.get('/', async (req, res) => {
  const supabase = createSupabaseClient();
  // Join with friends table to get owner_id and linked_user_id
  const { data, error } = await supabase
    .from('transactions')
    .select('*, friend:friends(owner_id, linked_user_id)');
  
  
  if (error) return res.status(500).json({ error: error.message });
  
  const formatted = data.map((t: any) => {
    // Determine fromId and toId
    let fromId = '';
    let toId = '';
    
    // Friend data
    const ownerId = t.friend.owner_id;
    const linkedId = t.friend.linked_user_id; // Might be null for local friend
    
    // Check if deleted
    const isDeleted = t.deleted || false;
    
    if (t.type === 'paid') {
       // "I paid Friend": From Owner -> To Friend
       fromId = ownerId;
       toId = linkedId || t.friend_id; // Fallback to friend ID for local
    } else {
       // "Friend paid Me": From Friend -> To Owner
       fromId = linkedId || t.friend_id;
       toId = ownerId;
    }

    return {
       ...t,
       friendId: t.friend_id,
       fromId,
       toId,
       deleted: isDeleted,
       description: "Settle Up"
    };
  });

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
      type, // 'paid' or 'received'
      deleted: false,
      date: new Date().toISOString()
    }])
    .select('*, friend:friends(owner_id, linked_user_id)')
    .single();

  if (error) return res.status(500).json({ error: error.message });

  await recalculateBalances(supabase);

  // Format return
  let fromId = '';
  let toId = '';
  const ownerId = data.friend.owner_id;
  const linkedId = data.friend.linked_user_id;
  
  if (type === 'paid') {
     fromId = ownerId;
     toId = linkedId || data.friend_id;
  } else {
     fromId = linkedId || data.friend_id;
     toId = ownerId;
  }

  const formatted = {
    ...data,
    friendId: data.friend_id,
    fromId,
    toId,
    description: "Settle Up",
    deleted: false
  };

  // System Comment
  await supabase.from('comments').insert({
    entity_type: 'payment',
    entity_id: data.id,
    user_id: (req as any).user.id,
    content: 'settled up',
    is_system: true
  });

  res.status(201).json(formatted);
});

router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const supabase = createSupabaseClient();

  const { error } = await supabase
    .from('transactions')
    .update({ deleted: true })
    .eq('id', id);

  if (error) return res.status(500).json({ error: error.message });

  await recalculateBalances(supabase);

  // System Comment
  await supabase.from('comments').insert({
    entity_type: 'payment',
    entity_id: id,
    user_id: (req as any).user.id,
    content: 'deleted this payment',
    is_system: true
  });

  res.json({ message: "Transaction deleted successfully" });
});

router.post('/:id/restore', async (req, res) => {
  const { id } = req.params;
  const supabase = createSupabaseClient();

  const { error } = await supabase
    .from('transactions')
    .update({ deleted: false })
    .eq('id', id);

  if (error) return res.status(500).json({ error: error.message });

  await recalculateBalances(supabase);

  const { data } = await supabase.from('transactions').select('*, friend:friends(owner_id, linked_user_id)').eq('id', id).single();
  
  // Format return
  let fromId = '';
  let toId = '';
  const ownerId = data?.friend?.owner_id;
  const linkedId = data?.friend?.linked_user_id;
  
  if (data.type === 'paid') {
     fromId = ownerId;
     toId = linkedId || data.friend_id;
  } else {
     fromId = linkedId || data.friend_id;
     toId = ownerId;
  }

  const formatted = {
    ...data,
    friendId: data.friend_id,
    fromId,
    toId,
    description: "Settle Up"
  };

  // System Comment
  await supabase.from('comments').insert({
    entity_type: 'payment',
    entity_id: id,
    user_id: (req as any).user.id,
    content: 'restored this payment',
    is_system: true
  });

  res.json(formatted);
});

export default router;
