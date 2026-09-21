import { useEffect, useState } from 'react';
import { Field, Notice } from '../components/Field';
import { Icon } from '../components/Icon';
import { authService } from '../services/auth';
import { disablePush } from '../features/notifications/service';
import { validateEmail, validatePassword, validateUsername } from '../lib/validation';
import { friendlyError } from '../lib/errors';
import { profileChanged, useAppDispatch, useAppSelector } from '../store';
import { useOnline } from '../hooks/useOnline';
import type { Profile } from '../types/models';
import { NotificationCard } from '../features/notifications/NotificationCard';

export function ProfilePage() {
  const user = useAppSelector((state) => state.auth.user);
  const dispatch = useAppDispatch();
  const online = useOnline();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [notificationRevision, setNotificationRevision] = useState(0);
  const [loadRevision, setLoadRevision] = useState(0);
  useEffect(() => {
    let active = true;
    void authService
      .profile()
      .then((value) => {
        if (active) {
          setProfile(value);
          setUsername(value.username);
          setEmail(value.email);
        }
      })
      .catch((failure) => {
        if (active) setError(friendlyError(failure));
      });
    return () => {
      active = false;
    };
  }, [user?.id, loadRevision]);
  async function perform(action: string, invalid: string | null, operation: () => Promise<void>) {
    setError(null);
    setMessage(null);
    if (invalid) {
      setError(invalid);
      return;
    }
    setBusy(action);
    try {
      await operation();
      if (action !== 'logout')
        setMessage(
          action === 'email'
            ? 'Check your current and new email inboxes to confirm the change.'
            : action === 'notifications'
              ? 'Notifications are disabled on this device.'
              : 'Your changes have been saved.',
        );
    } catch (failure) {
      setError(friendlyError(failure));
    } finally {
      setBusy(null);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">YOUR PERSONAL SPACE</span>
          <h1>
            Your profile<span className="heading-dot">.</span>
          </h1>
          <p>A few details that make this space yours.</p>
        </div>
      </div>
      {error && <Notice>{error}</Notice>}
      {message && <Notice success>{message}</Notice>}
      {!profile && !error && <p role="status">Loading your profile…</p>}
      {!profile && error && (
        <button
          className="button secondary"
          onClick={() => {
            setError(null);
            setLoadRevision((value) => value + 1);
          }}
        >
          Try again
        </button>
      )}
      {profile && (
        <div className="profile-grid">
          <section className="panel profile-panel">
            <div className="profile-identity">
              <span className="avatar large">{profile.username.slice(0, 1).toUpperCase()}</span>
              <div>
                <h2>{profile.username}</h2>
                <p>
                  Member since{' '}
                  {new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(
                    new Date(profile.created_at),
                  )}
                </p>
              </div>
            </div>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void perform('username', validateUsername(username), async () => {
                  await authService.username(profile.id, username);
                  const updated = { ...profile, username: username.trim() };
                  setProfile(updated);
                  dispatch(profileChanged(updated));
                });
              }}
            >
              <Field
                label="Username"
                autoComplete="username"
                required
                value={username}
                onChange={(event) => setUsername(event.target.value)}
              />
              <button className="button secondary" disabled={Boolean(busy) || !online}>
                {busy === 'username' ? 'Saving…' : 'Update username'}
              </button>
            </form>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void perform('email', validateEmail(email), () => authService.email(email));
              }}
            >
              <Field
                label="Email address"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                hint="Email changes need confirmation before they take effect."
              />
              <button className="button secondary" disabled={Boolean(busy) || !online}>
                {busy === 'email' ? 'Sending…' : 'Change email'}
              </button>
            </form>
          </section>
          <section className="panel profile-panel">
            <h2>Keep your account secure</h2>
            <p className="muted">A strong password brings a little peace of mind.</p>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void perform('password', validatePassword(password, repeat), async () => {
                  await authService.password(password);
                  setPassword('');
                  setRepeat('');
                });
              }}
            >
              <Field
                label="New password"
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                hint="12+ characters, with uppercase, lowercase, and a number."
              />
              <Field
                label="Repeat new password"
                type="password"
                autoComplete="new-password"
                required
                value={repeat}
                onChange={(event) => setRepeat(event.target.value)}
              />
              <button className="button secondary" disabled={Boolean(busy) || !online}>
                {busy === 'password' ? 'Saving…' : 'Update password'}
              </button>
            </form>
            <div className="logout-section">
              <h3>See you when you need us</h3>
              <p>Your reminders stay safely in your account.</p>
              <button
                className="button secondary"
                disabled={Boolean(busy) || !online}
                onClick={() =>
                  void perform('logout', null, async () => {
                    await disablePush();
                    await authService.signOut();
                  })
                }
              >
                <Icon name="logout" size={17} />
                {busy === 'logout' ? 'Signing out…' : 'Sign out'}
              </button>
            </div>
          </section>
        </div>
      )}
      <NotificationCard key={notificationRevision} />
      <button
        className="text-button"
        disabled={Boolean(busy) || !online}
        onClick={() =>
          void perform('notifications', null, async () => {
            await disablePush();
            setNotificationRevision((value) => value + 1);
          })
        }
      >
        Disable notifications on this device
      </button>
    </>
  );
}
