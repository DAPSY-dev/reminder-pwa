// @deno-types="@types/web-push"
import webpush from 'web-push';
import { admin, equalSecret, json, secret } from '../_shared/http.ts';

interface Delivery {
  id: string;
  lease_token: string;
  subscription_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  occurrence_id: string;
  generation: number;
  token: string;
  reminder_id: string;
  title: string;
  details: string;
}
// Endpoints are client input. Restrict outgoing requests to known push providers to prevent SSRF.
function allowedEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      (!url.port || url.port === '443') &&
      (url.hostname === 'fcm.googleapis.com' ||
        url.hostname === 'updates.push.services.mozilla.com' ||
        url.hostname === 'web.push.apple.com' ||
        url.hostname.endsWith('.notify.windows.com'))
    );
  } catch {
    return false;
  }
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    if (
      !(await equalSecret(
        request.headers.get('x-scheduler-secret') ?? '',
        secret('SCHEDULER_SECRET'),
      ))
    )
      return json({ error: 'Unauthorized' }, 401);
    const db = admin();
    const actionUrl = `${secret('PUBLIC_SUPABASE_URL').replace(/\/$/, '')}/functions/v1/notification-action`;
    webpush.setVapidDetails(
      secret('VAPID_SUBJECT'),
      secret('VAPID_PUBLIC_KEY'),
      secret('VAPID_PRIVATE_KEY'),
    );
    const { error: enqueueError } = await db.rpc('enqueue_due_notifications');
    if (enqueueError) throw enqueueError;
    const { data, error: claimError } = await db.rpc('claim_push_deliveries', { p_limit: 50 });
    if (claimError) throw claimError;
    const deliveries = data as Delivery[];
    let sent = 0;
    let failed = 0;
    // Small bounded concurrency keeps the invocation within Edge resource limits.
    for (let index = 0; index < deliveries.length; index += 5) {
      await Promise.all(
        deliveries.slice(index, index + 5).map(async (delivery) => {
          let outcome: 'sent' | 'retry' | 'failed' = 'sent';
          let errorCode: string | null = null;
          try {
            if (!allowedEndpoint(delivery.endpoint)) {
              outcome = 'failed';
              errorCode = 'unsupported_push_provider';
            } else {
              // Recheck cancellation/ownership immediately before the network request.
              const { data: current, error } = await db
                .from('push_deliveries')
                .select('state,lease_token')
                .eq('id', delivery.id)
                .maybeSingle();
              if (error) throw error;
              if (
                !current ||
                current.state !== 'sending' ||
                current.lease_token !== delivery.lease_token
              )
                return;
              const [
                { data: occurrence, error: occurrenceError },
                { data: subscription, error: subscriptionError },
              ] = await Promise.all([
                db
                  .from('notification_occurrences')
                  .select('user_id,state,generation')
                  .eq('id', delivery.occurrence_id)
                  .maybeSingle(),
                db
                  .from('push_subscriptions')
                  .select('user_id')
                  .eq('id', delivery.subscription_id)
                  .maybeSingle(),
              ]);
              if (occurrenceError || subscriptionError) throw occurrenceError || subscriptionError;
              if (
                !occurrence ||
                !subscription ||
                occurrence.user_id !== subscription.user_id ||
                occurrence.state !== 'notified' ||
                occurrence.generation !== delivery.generation
              )
                return;
              await webpush.sendNotification(
                {
                  endpoint: delivery.endpoint,
                  keys: { p256dh: delivery.p256dh, auth: delivery.auth },
                },
                JSON.stringify({
                  title: delivery.title,
                  body: delivery.details,
                  url: `/reminders/${delivery.reminder_id}/edit`,
                  occurrenceId: delivery.occurrence_id,
                  generation: delivery.generation,
                  token: delivery.token,
                  actionUrl,
                  gatewayKey: secret('SUPABASE_ANON_KEY'),
                }),
                { TTL: 3600, urgency: 'normal', timeout: 10000 },
              );
              sent++;
            }
          } catch (error) {
            const status =
              typeof error === 'object' && error !== null && 'statusCode' in error
                ? Number(error.statusCode)
                : 0;
            if (status === 404 || status === 410) {
              const { error: deleteError } = await db
                .from('push_subscriptions')
                .delete()
                .eq('id', delivery.subscription_id);
              if (deleteError) throw deleteError;
              failed++;
              return;
            }
            outcome = status >= 400 && status < 500 && status !== 429 ? 'failed' : 'retry';
            errorCode = status ? `push_http_${status}` : 'push_network_error';
            failed++;
          }
          const { error: finishError } = await db.rpc('finish_push_delivery', {
            p_id: delivery.id,
            p_lease_token: delivery.lease_token,
            p_outcome: outcome,
            p_error: errorCode,
          });
          if (finishError) throw finishError;
        }),
      );
    }
    // No titles, endpoints, credentials, or notification tokens in logs.
    console.info(JSON.stringify({ claimed: deliveries.length, sent, failed }));
    return json({ claimed: deliveries.length, sent, failed });
  } catch {
    console.error('Reminder dispatch failed');
    return json({ error: 'Dispatch failed' }, 500);
  }
});
