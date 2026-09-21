import { useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { loadReminders, useAppDispatch, useAppSelector } from '../store';

export function useReminders() {
  const dispatch = useAppDispatch();
  const userId = useAppSelector((state) => state.auth.user?.id);
  const state = useAppSelector((state) => state.reminders);
  useEffect(() => {
    if (!userId || !supabase) return;
    void dispatch(loadReminders());
    const refresh = () => {
      if (navigator.onLine) void dispatch(loadReminders());
    };
    const visible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    window.addEventListener('online', refresh);
    document.addEventListener('visibilitychange', visible);
    const channel = supabase
      .channel(`reminders:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'reminders', filter: `user_id=eq.${userId}` },
        refresh,
      )
      .subscribe();
    return () => {
      window.removeEventListener('online', refresh);
      document.removeEventListener('visibilitychange', visible);
      void supabase?.removeChannel(channel);
    };
  }, [dispatch, userId]);
  return state;
}
