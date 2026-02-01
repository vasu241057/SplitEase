import { Router } from 'express';
import { createSupabaseClient } from '../supabase';

const router = Router();

// Subscribe - enforces single subscription per user
router.post('/subscribe', async (req, res) => {
  try {
    const supabase = createSupabaseClient();
    const { subscription } = req.body;
    const userId = (req as any).user.id; 

    if (!subscription || !subscription.endpoint) {
       res.status(400).json({ error: 'Invalid subscription' });
       return;
    }

    // Delete all existing subscriptions for this user (single session enforcement)
    await supabase.from('push_subscriptions').delete().eq('user_id', userId);

    // Insert new subscription
    const { error } = await supabase.from('push_subscriptions').insert({
      user_id: userId,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth
    });

    if (error) throw error;

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error subscribing:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get notification status for current user
router.get('/status', async (req, res) => {
  try {
    const supabase = createSupabaseClient();
    const userId = (req as any).user.id;

    const { data, error } = await supabase
      .from('push_subscriptions')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;

    res.json({ enabled: !!data });
  } catch (error: any) {
    console.error('Error checking notification status:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
