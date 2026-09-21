import { useEffect } from 'react';
import { supabase } from '../lib/supabase';
import {
  cleared,
  recoveryChanged,
  sessionChanged,
  profileChanged,
  useAppDispatch,
  useAppSelector,
} from '../store';
import { authService } from '../services/auth';

export function useSession() {
  const dispatch = useAppDispatch();
  const user = useAppSelector((state) => state.auth.user);
  useEffect(() => {
    let active = true;
    if (user?.id)
      void authService
        .profile()
        .then((profile) => {
          if (active) dispatch(profileChanged(profile));
        })
        .catch(() => {
          // Header falls back to Auth data; the Profile page exposes loading errors.
        });
    return () => {
      active = false;
    };
  }, [dispatch, user?.id, user?.email]);
  useEffect(() => {
    if (!supabase) {
      dispatch(sessionChanged(null));
      return;
    }
    let active = true;
    let lastUser: string | undefined;
    let sawEvent = false;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      sawEvent = true;
      if (lastUser !== session?.user.id) dispatch(cleared());
      lastUser = session?.user.id;
      dispatch(sessionChanged(session?.user ?? null));
      if (
        event === 'PASSWORD_RECOVERY' ||
        (session && new URLSearchParams(location.search).get('recovery') === '1')
      )
        dispatch(recoveryChanged(true));
      if (event === 'SIGNED_OUT') dispatch(recoveryChanged(false));
    });
    void supabase.auth.getSession().then(({ data, error }) => {
      if (active && !sawEvent)
        dispatch(sessionChanged(error ? null : (data.session?.user ?? null)));
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [dispatch]);
}
