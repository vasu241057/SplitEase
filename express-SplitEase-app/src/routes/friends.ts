import express, { Router } from 'express';

import { authMiddleware } from '../middleware/auth';
import { createSupabaseClient } from '../supabase';

const router = express.Router();
router.use(authMiddleware);

router.get('/', async (req, res) => {
  const supabase = createSupabaseClient();
  const userId = (req as any).user.id;
  
  // 1. Get direct friends (owned by this user)
  const { data: directFriends, error } = await supabase
    .from('friends')
    .select('*')
    .eq('owner_id', userId);
  
  if (error) return res.status(500).json({ error: error.message });
  
  // Filter out the "Self" friend record
  const filteredDirectFriends = (directFriends || []).filter((f: any) => f.linked_user_id !== userId);
  
  // 2. Get group members from groups current user is in (that have linked_user_id)
  // First, find groups current user is a member of
  const { data: userGroups } = await supabase
    .from('group_members')
    .select('group_id, friends!inner(linked_user_id)')
    .eq('friends.linked_user_id', userId);
  
  const groupIds = (userGroups || []).map((g: any) => g.group_id);
  
  if (groupIds.length > 0) {
    // Get all members from those groups (excluding self)
    const { data: groupMembers } = await supabase
      .from('group_members')
      .select('friend_id, group_id, friends!inner(id, name, avatar, email, linked_user_id, balance, owner_id)')
      .in('group_id', groupIds)
      .not('friends.linked_user_id', 'is', null)
      .neq('friends.linked_user_id', userId);
    
    // Create a set of linked_user_ids already in direct friends
    const directLinkedIds = new Set(
      filteredDirectFriends
        .filter((f: any) => f.linked_user_id)
        .map((f: any) => f.linked_user_id)
    );
    
    // Add group members that aren't already direct friends
    const additionalFriends: any[] = [];
    const seenLinkedIds = new Set<string>();
    
    (groupMembers || []).forEach((gm: any) => {
      const linkedId = gm.friends.linked_user_id;
      if (linkedId && !directLinkedIds.has(linkedId) && !seenLinkedIds.has(linkedId)) {
        seenLinkedIds.add(linkedId);
        
        // For group-only friends, set balance to 0
        // Frontend will calculate correct pairwise balance from expenses/transactions
        additionalFriends.push({
          id: gm.friends.id,
          name: gm.friends.name,
          avatar: gm.friends.avatar,
          email: gm.friends.email,
          linked_user_id: linkedId,
          balance: 0,
          owner_id: null,
          isGroupMemberOnly: true
        });
      }
    });
    
    // Combine direct friends + group members
    const allFriends = [...filteredDirectFriends, ...additionalFriends];
    
    return res.json(allFriends);
  }
  
  res.json(filteredDirectFriends);
});

router.post('/', async (req, res) => {
  const { name, email } = req.body;
  const userId = (req as any).user.id;
  const supabase = createSupabaseClient();
  
  const { data, error } = await supabase
    .from('friends')
    .insert([{ 
      name, 
      email, 
      balance: 0,
      owner_id: userId
    }])
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
