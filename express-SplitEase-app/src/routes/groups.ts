import express from 'express';
import { createSupabaseClient } from '../supabase';

import { authMiddleware } from '../middleware/auth';

const router = express.Router();
router.use(authMiddleware);

router.get('/', async (req, res) => {
  const supabase = createSupabaseClient();
  const { data: groups, error } = await supabase
    .from('groups')
    .select('*, group_members(friend_id)');
    
  if (error) return res.status(500).json({ error: error.message });
  
  const formattedGroups = groups.map((g: any) => ({
    ...g,
    members: g.group_members.map((m: any) => m.friend_id)
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

  if (members && members.length > 0) {
    const memberInserts = members.map((friendId: string) => ({
      group_id: group.id,
      friend_id: friendId === 'currentUser' ? null : friendId
    })).filter((m: any) => m.friend_id);

    if (memberInserts.length > 0) {
      const { error: memberError } = await supabase
        .from('group_members')
        .insert(memberInserts);
      
      if (memberError) console.error('Error adding members:', memberError);
    }
  }

  res.status(201).json({ ...group, members: members || [] });
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
    .select('*, group_members(friend_id)')
    .eq('id', id)
    .single();
    
  if (fetchError) return res.status(500).json({ error: fetchError.message });

   const formattedGroup = {
    ...group,
    members: group.group_members.map((m: any) => m.friend_id)
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
