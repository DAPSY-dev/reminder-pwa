// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { AuthPage } from './AuthPage';
import { AppRoutes } from '../routes/AppRoutes';
import { store, sessionChanged, recoveryChanged, cleared } from '../store';
import { authService } from '../services/auth';
import type { User } from '@supabase/supabase-js';

vi.mock('../lib/supabase', () => ({ isConfigured: true, supabase: null }));
vi.mock('../services/auth', () => ({
  authService: { signIn: vi.fn(), signUp: vi.fn(), reset: vi.fn(), password: vi.fn() },
}));
beforeEach(() => {
  store.dispatch(sessionChanged(null));
  store.dispatch(recoveryChanged(false));
  store.dispatch(cleared());
  vi.clearAllMocks();
});
afterEach(cleanup);
function auth() {
  render(
    <Provider store={store}>
      <MemoryRouter>
        <AuthPage />
      </MemoryRouter>
    </Provider>,
  );
}
describe('authentication flows', () => {
  it('redirects a protected page to the single auth page', async () => {
    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/profile']}>
          <AppRoutes />
        </MemoryRouter>
      </Provider>,
    );
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeTruthy();
  });
  it('signs in using email and password and reports credential errors', async () => {
    vi.mocked(authService.signIn).mockRejectedValue({ code: 'invalid_credentials' });
    auth();
    fireEvent.change(screen.getByLabelText('Email address'), {
      target: { value: 'alice@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'WrongPassword123' } });
    fireEvent.submit(screen.getByLabelText('Password').closest('form')!);
    await waitFor(() =>
      expect(authService.signIn).toHaveBeenCalledWith('alice@example.com', 'WrongPassword123'),
    );
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Your email or password is incorrect.',
    );
  });
  it('validates matching registration passwords before contacting Supabase', async () => {
    auth();
    fireEvent.click(screen.getByRole('button', { name: 'Sign up' }));
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'alice' } });
    fireEvent.change(screen.getByLabelText('Email address'), {
      target: { value: 'alice@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'GoodPassword123' } });
    fireEvent.change(screen.getByLabelText('Repeat password'), {
      target: { value: 'Different123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Passwords do not match.',
    );
    expect(authService.signUp).not.toHaveBeenCalled();
  });
  it('sends a reset link without exposing whether an account exists', async () => {
    vi.mocked(authService.reset).mockResolvedValue(undefined);
    auth();
    fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }));
    fireEvent.change(screen.getByLabelText('Email address'), {
      target: { value: 'alice@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
    await waitFor(() => expect(authService.reset).toHaveBeenCalledWith('alice@example.com'));
    expect(await screen.findByRole('status')).toHaveProperty(
      'textContent',
      'If an account uses that email, a reset link is on its way. Check your inbox.',
    );
  });
  it('keeps a recovery session on the password reset form', async () => {
    store.dispatch(
      sessionChanged({ id: 'user', email: 'alice@example.com', user_metadata: {} } as User),
    );
    store.dispatch(recoveryChanged(true));
    auth();
    expect(screen.getByRole('heading', { name: 'Choose a new password' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('New password'), {
      target: { value: 'NewPassword123' },
    });
    fireEvent.change(screen.getByLabelText('Repeat password'), {
      target: { value: 'NewPassword123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save new password' }));
    await waitFor(() => expect(authService.password).toHaveBeenCalledWith('NewPassword123'));
    expect(store.getState().auth.recovery).toBe(false);
  });
});
