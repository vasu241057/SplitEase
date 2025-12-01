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
