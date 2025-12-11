import { Router } from 'express';
import { createSupabaseClient } from '../supabase';

const router = Router();

// Subscribe
router.post('/subscribe', async (req, res) => {
  try {
    const supabase = createSupabaseClient();
    const { subscription } = req.body;
    // Assuming auth middleware puts user in req.user
    const userId = (req as any).user.id; 

    if (!subscription || !subscription.endpoint) {
       res.status(400).json({ error: 'Invalid subscription' });
       return
    }

    const { error } = await supabase.from('push_subscriptions').upsert({
      user_id: userId,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth
    }, { onConflict: 'endpoint' });

    if (error) throw error;

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error subscribing:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
