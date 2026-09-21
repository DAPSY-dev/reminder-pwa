export function friendlyError(error: unknown): string {
  const value = error as { code?: string; message?: string; name?: string } | null;
  if (value?.code === '23505') return 'That username or email is already in use.';
  if (value?.code === 'invalid_credentials') return 'Your email or password is incorrect.';
  if (value?.code === 'email_not_confirmed') return 'Confirm your email before signing in.';
  if (value?.code === 'user_already_exists')
    return 'An account already uses that email. Try signing in.';
  if (value?.code === 'over_email_send_rate_limit' || value?.code === 'over_request_rate_limit')
    return 'Too many attempts. Please wait a moment and try again.';
  if (value?.code === 'weak_password') return 'Choose a stronger password.';
  if (value?.code === 'reauthentication_needed' || value?.code === 'reauthentication_not_valid')
    return 'For security, sign in again before changing your password, or use Forgot password.';
  if (!navigator.onLine || value?.message?.includes('fetch'))
    return 'Could not connect. Check your connection and try again.';
  return 'We couldn’t complete that request. Please try again.';
}
