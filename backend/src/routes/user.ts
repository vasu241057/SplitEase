import { Router } from 'express';
import { createSupabaseClient } from '../supabase';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// Get current user profile (including invite code)
router.get('/profile', authMiddleware, async (req, res) => {
  try {
    const supabase = createSupabaseClient();
    const userId = (req as any).user.id;
    const user = (req as any).user;
    
    let { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error) throw error;

    // If profile doesn't exist (e.g. old user), create it
    if (!data) {
      const { data: newProfile, error: createError } = await supabase
        .from('profiles')
        .insert({
          id: userId,
          email: user.email,
          full_name: user.user_metadata?.full_name || user.user_metadata?.name || '',
          avatar_url: user.user_metadata?.avatar_url || ''
        })
        .select()
        .single();
      
      if (createError) throw createError;
      data = newProfile;
    }

    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Update user profile
router.put('/profile', authMiddleware, async (req, res) => {
  try {
    const supabase = createSupabaseClient();
    const userId = (req as any).user.id;
    const { full_name } = req.body;

    if (!full_name) {
      return res.status(400).json({ error: 'Full name is required' });
    }

    // 1. Update Profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .update({ full_name })
      .eq('id', userId)
      .select()
      .single();

    if (profileError) throw profileError;

    // 2. Propagate to Friends table (where this user is a friend)
    const { error: friendsError } = await supabase
      .from('friends')
      .update({ name: full_name })
      .eq('linked_user_id', userId);

    if (friendsError) {
      console.error('Failed to propagate name change to friends:', friendsError);
      // Don't fail the request, just log it
    }

    res.json(profile);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get public profile by invite code
router.get('/invite/:code', async (req, res) => {
  try {
    const supabase = createSupabaseClient();
    const { code } = req.params;
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url')
      .eq('invite_code', code)
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error: any) {
    res.status(404).json({ error: 'Invite not found' });
  }
});

export default router;
