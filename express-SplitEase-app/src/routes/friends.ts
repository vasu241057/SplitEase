import express, { Router } from 'express';

import { authMiddleware } from '../middleware/auth';
import { createSupabaseClient } from '../supabase';

const router = express.Router();
router.use(authMiddleware);

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

// Accept Invite
router.post('/accept-invite', authMiddleware, async (req, res) => {
  try {
    const supabase = createSupabaseClient();
    const userId = (req as any).user.id;
    const { inviteCode } = req.body;

    // 1. Find Sender
    const { data: sender, error: senderError } = await supabase
      .from('profiles')
      .select('*')
      .eq('invite_code', inviteCode)
      .single();

    if (senderError || !sender) throw new Error('Invalid invite code');
    if (sender.id === userId) throw new Error('You cannot invite yourself');

    // 2. Find Receiver (Current User)
    const { data: receiver, error: receiverError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
      
    if (receiverError) throw new Error('User profile not found');

    // 3. Add Sender to Receiver's friends
    // Check if already exists
    const { data: existingFriend } = await supabase
      .from('friends')
      .select('*')
      .eq('linked_user_id', sender.id)
      .eq('owner_id', userId) 
      .single();

    if (existingFriend) {
        return res.json({ success: true, friend: existingFriend, message: 'Already friends' });
    }
    
    // Insert Sender as Friend for Receiver
    const { error: addSenderError } = await supabase
      .from('friends')
      .insert({
        name: sender.full_name || 'Unknown',
        email: sender.email,
        avatar: sender.avatar_url,
        linked_user_id: sender.id,
        owner_id: userId 
      });

    if (addSenderError) throw addSenderError;

    // 4. Add Receiver as Friend for Sender
    const { error: addReceiverError } = await supabase
      .from('friends')
      .insert({
        name: receiver.full_name || 'Unknown',
        email: receiver.email,
        avatar: receiver.avatar_url,
        linked_user_id: userId,
        owner_id: sender.id
      });

    if (addReceiverError) throw addReceiverError;

    res.json({ success: true, friend: sender });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

export default router;
