import { useEffect, useState } from 'react';
import { Icon } from '../../components/Icon';
import { useAppSelector } from '../../store';
import { database } from '../../lib/supabase';
import { enablePush, pushSupport } from './service';

export function NotificationCard() {
  const user = useAppSelector((state) => state.auth.user);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    if (!pushSupport() && user)
      void navigator.serviceWorker.ready
        .then(async (registration) => {
          const subscription = await registration.pushManager.getSubscription();
          if (!subscription) return;
          const { data } = await database()
            .from('push_subscriptions')
            .select('id')
            .eq('endpoint', subscription.endpoint)
            .maybeSingle();
          if (active) setEnabled(Boolean(data));
        })
        .catch(() => {
          /* The user can retry from the enable button. */
        });
    return () => {
      active = false;
    };
  }, [user]);
  async function enable() {
    if (!user) return;
    const unsupported = pushSupport();
    if (unsupported) {
      setMessage(unsupported);
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await enablePush(user.id);
      setEnabled(true);
    } catch (error) {
      setMessage(
        error instanceof Error && error.message === 'permission-denied'
          ? 'Notifications are blocked. Allow them in your browser settings, then try again.'
          : 'Could not enable notifications. Check your connection and try again.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <aside className={`notification-card ${enabled ? 'enabled' : ''}`}>
      <span className="notification-icon">
        <Icon name={enabled ? 'check' : 'bell'} size={23} />
      </span>
      <div>
        <h3>{enabled ? 'You’re all set' : 'A gentle nudge, right on time'}</h3>
        <p>
          {enabled
            ? 'Notifications are enabled on this device.'
            : 'Enable notifications to get reminders even when the app is closed.'}
        </p>
        {message && (
          <p className="text-error" role="alert">
            {message}
          </p>
        )}
      </div>
      {!enabled && (
        <button className="button secondary" onClick={() => void enable()} disabled={busy}>
          {busy ? 'Enabling…' : 'Enable notifications'}
          <Icon name="chevron" size={16} />
        </button>
      )}
    </aside>
  );
}
