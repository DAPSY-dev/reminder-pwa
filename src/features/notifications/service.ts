import { database } from '../../lib/supabase';

export function pushSupport(): string | null {
  if (!isSecureContext) return 'Notifications require HTTPS or localhost.';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window))
    return 'Push notifications aren’t available here. On iPhone or iPad, add this app to your Home Screen and open it there.';
  if (
    !import.meta.env.VITE_VAPID_PUBLIC_KEY ||
    import.meta.env.VITE_VAPID_PUBLIC_KEY.includes('replace-with')
  )
    return 'Push notifications haven’t been configured yet.';
  return null;
}
function applicationKey(value: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const raw = atob((value + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}
export async function enablePush(userId: string): Promise<void> {
  if (!userId) throw new Error('not-authenticated');
  if (pushSupport()) throw new Error('unsupported');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('permission-denied');
  const registration = await navigator.serviceWorker.ready;
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: applicationKey(import.meta.env.VITE_VAPID_PUBLIC_KEY),
    }));
  const value = subscription.toJSON();
  if (!value.keys?.p256dh || !value.keys.auth) throw new Error('subscription-failed');
  // RPC can transfer an installation between signed-in accounts without exposing ownership.
  const { error } = await database().rpc('register_push_subscription', {
    p_endpoint: subscription.endpoint,
    p_p256dh: value.keys.p256dh,
    p_auth: value.keys.auth,
  });
  if (error) throw error;
}
export async function disablePush(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;
  const { error } = await database()
    .from('push_subscriptions')
    .delete()
    .eq('endpoint', subscription.endpoint);
  if (error) throw error;
  await subscription.unsubscribe();
}
