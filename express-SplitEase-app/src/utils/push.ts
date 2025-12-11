import webpush from 'web-push';
import { createSupabaseClient } from '../supabase';

interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY: string;
  VAPID_SUBJECT: string;
}

export async function sendPushNotification(
  env: Env,
  userIds: string[],
  title: string,
  body: string,
  url: string = '/'
) {
  try {
    webpush.setVapidDetails(
      env.VAPID_SUBJECT,
      env.VAPID_PUBLIC_KEY,
      env.VAPID_PRIVATE_KEY
    );

    const supabase = createSupabaseClient();

    console.error('[PUSH LOG] Fetching subscriptions for users:', userIds);
    // Get subscriptions for users
    const { data: subscriptions, error } = await supabase
      .from('push_subscriptions')
      .select('*')
      .in('user_id', userIds);

    if (error) {
        console.error('[PUSH LOG] Database error fetching subscriptions:', error);
        return;
    }

    if (!subscriptions || subscriptions.length === 0) {
      console.error('[PUSH LOG] No subscriptions found in DB for these users.');
      return;
    }

    console.error(`[PUSH LOG] Found ${subscriptions.length} subscriptions. Preparing to send...`);

    const payload = JSON.stringify({
      title,
      body,
      url,
      icon: '/logo.jpg'
    });

    // Send to all subscriptions
    const promises = subscriptions.map(async (sub) => {
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth
        }
      };

      try {
        console.error(`[PUSH LOG] Sending to endpoint: ${sub.endpoint.slice(0, 30)}...`);
        const result = await webpush.sendNotification(pushSubscription, payload);
        console.error('[PUSH LOG] Send result status:', result.statusCode);
      } catch (err: any) {
        console.error('[PUSH LOG] Error sending individual push:', err.statusCode, err.message);
        if (err.statusCode === 410 || err.statusCode === 404) {
          // Subscription expired or invalid, delete it
          console.error('[PUSH LOG] Deleting expired subscription:', sub.id);
          await supabase.from('push_subscriptions').delete().eq('id', sub.id);
        }
      }
    });

    await Promise.all(promises);
    console.error('[PUSH LOG] Finished processing all notifications.');

  } catch (error) {
    console.error('[PUSH LOG] Critical failure in sendPushNotification:', error);
  }
}
