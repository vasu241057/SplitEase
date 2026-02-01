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
  console.log(`[Push] Sending notification to ${userIds.length} users. Title: "${title}", URL: "${url}"`);

  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
      console.error('[Push] Missing VAPID keys provided to sendPushNotification');
      return;
  }
  
  // Set VAPID
  try {
      webpush.setVapidDetails(
        env.VAPID_SUBJECT || 'mailto:admin@example.com',
        env.VAPID_PUBLIC_KEY,
        env.VAPID_PRIVATE_KEY
      );
  } catch(e) {
      console.error('[Push] Failed to set VAPID details', e);
      return;
  }

  const supabase = createSupabaseClient(); 

  // For each user, get subscriptions
  for (const userId of userIds) {
    const { data: subs, error } = await supabase
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth, id') // Select columns directly
      .eq('user_id', userId);

    if (error) {
        console.error(`[Push] Error fetching subs for ${userId}:`, error);
        continue;
    }
    
    if (!subs || subs.length === 0) {
        console.log(`[Push] No subscriptions found for user ${userId}`);
        continue;
    }

    console.log(`[Push] Found ${subs.length} subscriptions for user ${userId}`);

    const payload = JSON.stringify({
      title,
      body,
      url, 
      icon: '/icon-192x192.png'
    });

    for (const subRecord of subs) {
      // Construct subscription object for web-push
      const sub = {
          endpoint: subRecord.endpoint,
          keys: {
              p256dh: subRecord.p256dh,
              auth: subRecord.auth
          }
      };

      try {
        await webpush.sendNotification(sub, payload);
        console.log(`[Push] Notification sent to user ${userId} (sub ${subRecord.id})`);
      } catch (err: any) {
        console.error(`[Push] Failed to send to ${userId} (sub ${subRecord.id}):`, err?.statusCode, err?.body || err);
        if (err?.statusCode === 410 || err?.statusCode === 404) {
           console.log(`[Push] Deleting invalid subscription ${subRecord.id}`);
           await supabase
             .from('push_subscriptions')
             .delete()
             .eq('id', subRecord.id); 
        }
      }
    }
  }
}
