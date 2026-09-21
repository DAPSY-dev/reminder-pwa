import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Field, Notice } from '../components/Field';
import { Icon } from '../components/Icon';
import { isConfigured } from '../lib/supabase';
import { friendlyError } from '../lib/errors';
import { validateEmail, validatePassword, validateUsername } from '../lib/validation';
import { authService } from '../services/auth';
import { recoveryChanged, useAppDispatch, useAppSelector } from '../store';

type Mode = 'signin' | 'signup' | 'forgot';
export function AuthPage() {
  const { user, recovery, ready } = useAppSelector((state) => state.auth);
  const dispatch = useAppDispatch();
  const [mode, setMode] = useState<Mode>('signin');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const recovering = recovery && Boolean(user);
  if (!ready)
    return (
      <div className="app-loading" role="status">
        <span className="spinner" />
        Opening your space…
      </div>
    );
  if (user && !recovery) return <Navigate to="/" replace />;
  function switchMode(value: Mode) {
    setMode(value);
    setError(null);
    setMessage(null);
    setPassword('');
    setRepeat('');
  }
  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    const invalid = recovering
      ? validatePassword(password, repeat)
      : (validateEmail(email) ??
        (mode === 'signup'
          ? (validateUsername(username) ?? validatePassword(password, repeat))
          : null));
    if (invalid) {
      setError(invalid);
      return;
    }
    setBusy(true);
    try {
      if (recovering) {
        await authService.password(password);
        history.replaceState(null, '', '/auth');
        dispatch(recoveryChanged(false));
      } else if (mode === 'signin') await authService.signIn(email, password);
      else if (mode === 'forgot') {
        await authService.reset(email);
        setMessage('If an account uses that email, a reset link is on its way. Check your inbox.');
      } else {
        const data = await authService.signUp(username, email, password);
        if (data.user?.identities?.length === 0)
          setError('An account already uses that email. Try signing in.');
        else setMessage('Check your inbox to confirm your email, then sign in.');
      }
    } catch (failure) {
      setError(friendlyError(failure));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-layout">
      <section className="auth-story">
        <a href="/" className="brand">
          <span className="brand-icon">
            <Icon name="bell" size={23} />
          </span>
          reminder<span className="brand-dot">.</span>
        </a>
        <div className="story-content">
          <span className="eyebrow">MAKE ROOM FOR WHAT MATTERS</span>
          <h1>
            A little less
            <br /> to keep
            <br /> <em>in mind.</em>
          </h1>
          <p>
            Life has enough moving parts.
            <br />
            Let your reminders take care of the little things.
          </p>
          <div className="story-card">
            <span className="story-bell">
              <Icon name="bell" size={24} />
            </span>
            <div>
              <strong>Take a moment for yourself</strong>
              <span>Every day · 9:00 AM</span>
            </div>
            <span className="story-check">
              <Icon name="check" size={17} />
            </span>
          </div>
        </div>
        <div className="story-footer">
          <span>Simple. Thoughtful. Right on time.</span>
          <span>✳</span>
        </div>
      </section>
      <main className="auth-panel">
        <div className="auth-form-container">
          <span className="eyebrow">YOUR PERSONAL REMINDER SPACE</span>
          <h2>
            {recovering
              ? 'Choose a new password'
              : mode === 'forgot'
                ? 'Let’s get you back in'
                : mode === 'signup'
                  ? 'Make a little room'
                  : 'Welcome back'}
          </h2>
          <p className="muted">
            {recovering
              ? 'Set a secure password for your account.'
              : mode === 'forgot'
                ? 'We’ll email you a link to reset your password.'
                : mode === 'signup'
                  ? 'Create an account and leave the remembering to us.'
                  : 'Your reminders are right where you left them.'}
          </p>
          {!recovering && mode !== 'forgot' && (
            <div className="auth-tabs">
              <button
                className={mode === 'signin' ? 'selected' : ''}
                onClick={() => switchMode('signin')}
              >
                Sign in
              </button>
              <button
                className={mode === 'signup' ? 'selected' : ''}
                onClick={() => switchMode('signup')}
              >
                Sign up
              </button>
            </div>
          )}
          {!isConfigured && (
            <Notice>
              Local setup is needed. Add your Supabase URL and public key to <code>.env</code>,
              apply the migration, and restart the dev server. See the README for instructions.
            </Notice>
          )}
          {error && <Notice>{error}</Notice>}
          {message && <Notice success>{message}</Notice>}
          <form onSubmit={(event) => void submit(event)}>
            {mode === 'signup' && !recovering && (
              <Field
                label="Username"
                autoComplete="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="Your username"
                required
                maxLength={30}
              />
            )}
            {!recovering && (
              <Field
                label="Email address"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                required
              />
            )}
            {(recovering || mode !== 'forgot') && (
              <Field
                label={recovering ? 'New password' : 'Password'}
                type="password"
                autoComplete={mode === 'signup' || recovering ? 'new-password' : 'current-password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter your password"
                required
                maxLength={128}
                hint={
                  mode === 'signup' || recovering
                    ? '12+ characters, with uppercase, lowercase, and a number.'
                    : undefined
                }
              />
            )}
            {(recovering || mode === 'signup') && (
              <Field
                label="Repeat password"
                type="password"
                autoComplete="new-password"
                value={repeat}
                onChange={(event) => setRepeat(event.target.value)}
                required
                maxLength={128}
              />
            )}
            {mode === 'signin' && !recovering && (
              <button
                type="button"
                className="text-button forgot-link"
                onClick={() => switchMode('forgot')}
              >
                Forgot password?
              </button>
            )}
            <button
              type="submit"
              className="button primary auth-submit"
              disabled={busy || !isConfigured}
            >
              {busy
                ? 'One moment…'
                : recovering
                  ? 'Save new password'
                  : mode === 'signup'
                    ? 'Create account'
                    : mode === 'forgot'
                      ? 'Send reset link'
                      : 'Sign in'}
              <Icon name="chevron" size={18} />
            </button>
          </form>
          {mode === 'forgot' && !recovering && (
            <button className="text-button back-to-signin" onClick={() => switchMode('signin')}>
              <Icon name="arrow" size={16} />
              Back to sign in
            </button>
          )}
          <p className="auth-fineprint">
            <Icon name="check" size={14} />
            Private by design. Your reminders belong to you.
          </p>
        </div>
      </main>
    </div>
  );
}
