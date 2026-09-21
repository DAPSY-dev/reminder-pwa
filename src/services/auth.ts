import { database } from '../lib/supabase';
import type { Profile } from '../types/models';

export const authService = {
  async signIn(email: string, password: string) {
    const { error } = await database().auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw error;
  },
  async signUp(username: string, email: string, password: string) {
    const { data: available, error: lookupError } = await database().rpc('username_available', {
      p_username: username.trim(),
    });
    if (lookupError) throw lookupError;
    if (!available) throw { code: '23505' };
    const { data, error } = await database().auth.signUp({
      email: email.trim(),
      password,
      options: { data: { username: username.trim() }, emailRedirectTo: `${location.origin}/auth` },
    });
    if (error) throw error;
    return data;
  },
  async reset(email: string) {
    const { error } = await database().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${location.origin}/auth?recovery=1`,
    });
    if (error) throw error;
  },
  async signOut() {
    const { error } = await database().auth.signOut();
    if (error) throw error;
  },
  async profile(): Promise<Profile> {
    const { data, error } = await database().from('profiles').select('*').single();
    if (error) throw error;
    return data as Profile;
  },
  async username(id: string, username: string) {
    const { error } = await database()
      .from('profiles')
      .update({ username: username.trim() })
      .eq('id', id);
    if (error) throw error;
  },
  async email(email: string) {
    const { error } = await database().auth.updateUser(
      { email: email.trim() },
      { emailRedirectTo: `${location.origin}/profile` },
    );
    if (error) throw error;
  },
  async password(password: string) {
    const { error } = await database().auth.updateUser({ password });
    if (error) throw error;
  },
};
