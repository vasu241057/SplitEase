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

    // Get subscriptions for users
    const { data: subscriptions, error } = await supabase
      .from('push_subscriptions')
      .select('*')
      .in('user_id', userIds);

    if (error || !subscriptions || subscriptions.length === 0) {
      console.log('No subscriptions found for users:', userIds);
      return;
    }

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
        await webpush.sendNotification(pushSubscription, payload);
      } catch (err: any) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          // Subscription expired or invalid, delete it
          await supabase.from('push_subscriptions').delete().eq('id', sub.id);
        } else {
            console.error('Error sending push notification:', err);
        }
      }
    });

    await Promise.all(promises);
    console.log(`Sent notifications to ${subscriptions.length} devices.`);

  } catch (error) {
    console.error('Failed to send push notifications:', error);
  }
}
