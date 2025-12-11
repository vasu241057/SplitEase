import express from 'express';
import { createSupabaseClient } from '../supabase';
import { authMiddleware } from '../middleware/auth';

const router = express.Router();
router.use(authMiddleware);

// GET comments for an entity
router.get('/:entityType/:entityId', async (req, res) => {
  const { entityType, entityId } = req.params;
  const supabase = createSupabaseClient();

  // Validate entityType
  if (!['expense', 'payment'].includes(entityType)) {
    return res.status(400).json({ error: 'Invalid entity type' });
  }

  // Fetch comments
  const { data: comments, error } = await supabase
    .from('comments')
    .select('*')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .order('created_at', { ascending: true });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  // Enrich with user details manually if needed, or assume frontend can map IDs if they are friends/users.
  // However, for a chat, it's better to return author info.
  // The 'user_id' in comments could be a UUID (Supabase Auth ID).
  // We can fetch profiles. 
  
  // Collect all unique user_ids
  const userIds = [...new Set(comments.map((c: any) => c.user_id))];
  
  // Fetch profiles for these users
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, avatar_url')
    .in('id', userIds);

  const profileMap = new Map();
  if (profiles) {
    profiles.forEach((p: any) => {
      profileMap.set(p.id, { name: p.full_name || 'Unknown', avatar: p.avatar_url });
    });
  }

  const enriched = comments.map((c: any) => ({
    ...c,
    author: profileMap.get(c.user_id) || { name: 'Unknown User', avatar: null }
  }));

  res.json(enriched);
});

// POST a new comment
router.post('/:entityType/:entityId', async (req, res) => {
  const { entityType, entityId } = req.params;
  const { content } = req.body;
  const userId = (req as any).user.id;
  const supabase = createSupabaseClient();

  if (!content) {
    return res.status(400).json({ error: 'Content is required' });
  }

  if (!['expense', 'payment'].includes(entityType)) {
      return res.status(400).json({ error: 'Invalid entity type' });
  }

  const { data, error } = await supabase
    .from('comments')
    .insert([{
      entity_type: entityType,
      entity_id: entityId,
      user_id: userId,
      content,
      is_system: false
    }])
    .select()
    .single();

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  // Return with author info (current user)
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, avatar_url')
    .eq('id', userId)
    .single();
    
  const enriched = {
    ...data,
    author: {
        name: profile?.full_name || 'You',
        avatar: profile?.avatar_url
    }
  };

  res.status(201).json(enriched);
});

export default router;
