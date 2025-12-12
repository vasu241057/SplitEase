import express from 'express';
import { createSupabaseClient } from '../supabase';

import { authMiddleware } from '../middleware/auth';

const router = express.Router();
router.use(authMiddleware);

router.get('/', async (req, res) => {
  const supabase = createSupabaseClient();
  // 1. Get IDs of groups the user belongs to (via friends table linking)
  const { data: memberGroups, error: memberError } = await supabase
    .from('group_members')
    .select('group_id, friends!inner(linked_user_id)')
    .eq('friends.linked_user_id', (req as any).user.id);

  console.log('[GET /groups] User ID:', (req as any).user?.id); // Keep log for verification
  // console.log('[GET /groups] Member Groups found:', memberGroups); 

  if (memberError) return res.status(500).json({ error: memberError.message });

  const groupIds = memberGroups.map((mg: any) => mg.group_id);

  if (groupIds.length === 0) return res.json([]);

  const { data: groups, error } = await supabase
    .from('groups')
    .select('*, group_members(friends(id, name, avatar, linked_user_id))') // Nested fetch
    .in('id', groupIds);
    
  if (error) return res.status(500).json({ error: error.message });
  
  const formattedGroups = groups.map((g: any) => ({
    ...g,
    members: g.group_members.map((gm: any) => ({
        id: gm.friends.id,
        name: gm.friends.name,
        avatar: gm.friends.avatar || '',
        userId: gm.friends.linked_user_id
    })) 
  }));

  res.json(formattedGroups);
});

router.post('/', async (req, res) => {
  const { name, type, members } = req.body;
  const supabase = createSupabaseClient();
  
  const { data: group, error: groupError } = await supabase
    .from('groups')
    .insert([{ name, type }])
    .select()
    .single();

  if (groupError) return res.status(500).json({ error: groupError.message });

  // Add CREATOR to the group immediately
  const creatorId = (req as any).user?.id;
  // console.log('[POST /groups] Creator ID:', creatorId);
  // console.log('[POST /groups] Original members payload:', members);
  
  // 1. Find or Create "Self Friend" record for the creator
  // We need a friend record that represents 'Me' to add to group_members
  let selfFriendId: string | null = null;
  
  if (creatorId) {
      const { data: selfFriend } = await supabase
          .from('friends')
          .select('id')
          .eq('linked_user_id', creatorId)
          .eq('owner_id', creatorId)
          .single();
      
      if (selfFriend) {
          selfFriendId = selfFriend.id;
      } else {
           // Create Self Friend
           // Ideally we fetch user profile name, but 'You' is safe fallback or use email if needed.
           // We can skip profile fetch for speed if we trust 'You' or just update it later.
           const { data: newFriend, error: createError } = await supabase
            .from('friends')
            .insert([{ 
                name: 'You', 
                owner_id: creatorId, 
                linked_user_id: creatorId,
                balance: 0 
            }])
            .select()
            .single();
            
            if (newFriend) selfFriendId = newFriend.id;
            if (createError) console.error('Error creating self-friend:', createError);
      }
  }

  // 2. Prepare Member List
  let validMembers = [];
  
  // Add other selected members
  if (members && members.length > 0) {
     validMembers = members.map((friendId: string) => ({
      group_id: group.id,
      friend_id: friendId === 'currentUser' ? selfFriendId : friendId
    })).filter((m: any) => m.friend_id && m.friend_id !== 'currentUser');
  }
  
  // Add self (creator) if not already added
  if (selfFriendId && !validMembers.find((m: any) => m.friend_id === selfFriendId)) {
      validMembers.push({ group_id: group.id, friend_id: selfFriendId });
  }

  if (validMembers.length > 0) {
      const { error: memberError } = await supabase
        .from('group_members')
        .insert(validMembers);
      
      if (memberError) console.error('Error adding members:', memberError);
  }

  // We should ideally fetch the group again to get full member details, or construct a partial response.
  // The frontend might expect the full rich object now. 
  // For simplicity, let's return [] for members as they are added but we don't have their Profile info handy without a refetch.
  // Actually, wait. 'addGroup' in frontend does invalidateQueries(['groups']). So returning minimal data is fine.
  // But strictly matching the type 'GroupMember[]' in the response might be required if frontend updates optimistic.
  // Current DataContext just invalidates. So we can return empty or basic.
  
  res.status(201).json({ ...group, members: [] });
});

router.post('/:id/members', async (req, res) => {
  const { id } = req.params;
  const { memberId } = req.body;
  const supabase = createSupabaseClient();

  const { error } = await supabase
    .from('group_members')
    .insert([{ group_id: id, friend_id: memberId }]);

  if (error) return res.status(500).json({ error: error.message });

  const { data: group, error: fetchError } = await supabase
    .from('groups')
    .select('*, group_members(friends(id, name, avatar, linked_user_id))')
    .eq('id', id)
    .single();
    
  if (fetchError) return res.status(500).json({ error: fetchError.message });

   const formattedGroup = {
    ...group,
    members: group.group_members.map((gm: any) => ({
        id: gm.friends.id,
        name: gm.friends.name,
        avatar: gm.friends.avatar || '',
        userId: gm.friends.linked_user_id
    }))
  };

  res.json(formattedGroup);
});

router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const supabase = createSupabaseClient();

  const { error } = await supabase
    .from('groups')
    .delete()
    .eq('id', id);

  if (error) return res.status(500).json({ error: error.message });
  res.status(204).send();
});

export default router;
