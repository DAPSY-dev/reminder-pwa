import { configureStore, createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import { useDispatch, useSelector } from 'react-redux';
import type { User } from '@supabase/supabase-js';
import type { Reminder, Profile } from '../types/models';
import { reminderService } from '../services/reminders';
import { friendlyError } from '../lib/errors';

const authSlice = createSlice({
  name: 'auth',
  initialState: {
    user: null as User | null,
    profile: null as Profile | null,
    ready: false,
    recovery: false,
  },
  reducers: {
    sessionChanged(state, action: PayloadAction<User | null>) {
      if (state.user?.id !== action.payload?.id) state.profile = null;
      state.user = action.payload;
      state.ready = true;
    },
    profileChanged(state, action: PayloadAction<Profile>) {
      if (state.user?.id === action.payload.id) state.profile = action.payload;
    },
    recoveryChanged(state, action: PayloadAction<boolean>) {
      state.recovery = action.payload;
    },
  },
});
export const loadReminders = createAsyncThunk('reminders/load', async (_, { rejectWithValue }) => {
  try {
    return await reminderService.list();
  } catch (error) {
    return rejectWithValue(friendlyError(error));
  }
});
const reminderSlice = createSlice({
  name: 'reminders',
  initialState: {
    items: [] as Reminder[],
    ownerId: null as string | null,
    loading: false,
    loaded: false,
    error: null as string | null,
    requestId: null as string | null,
  },
  reducers: {
    cleared(state) {
      state.items = [];
      state.loaded = false;
      state.loading = false;
      state.error = null;
      state.requestId = null;
    },
    upserted(state, action: PayloadAction<Reminder>) {
      if (action.payload.user_id !== state.ownerId) return;
      const index = state.items.findIndex((item) => item.id === action.payload.id);
      if (index < 0) state.items.unshift(action.payload);
      else state.items[index] = action.payload;
    },
    removed(state, action: PayloadAction<string>) {
      state.items = state.items.filter((item) => item.id !== action.payload);
    },
  },
  extraReducers: (builder) =>
    builder
      .addCase(authSlice.actions.sessionChanged, (state, action) => {
        const ownerId = action.payload?.id ?? null;
        if (state.ownerId === ownerId) return;
        state.ownerId = ownerId;
        state.items = [];
        state.loading = false;
        state.loaded = false;
        state.error = null;
        state.requestId = null;
      })
      .addCase(loadReminders.pending, (state, action) => {
        state.loading = true;
        state.error = null;
        state.requestId = action.meta.requestId;
      })
      .addCase(loadReminders.fulfilled, (state, action) => {
        if (state.requestId !== action.meta.requestId) return;
        state.loading = false;
        state.loaded = true;
        state.items = action.payload;
      })
      .addCase(loadReminders.rejected, (state, action) => {
        if (state.requestId !== action.meta.requestId) return;
        state.loading = false;
        state.error =
          typeof action.payload === 'string' ? action.payload : 'Could not load reminders.';
      }),
});
export const { sessionChanged, recoveryChanged, profileChanged } = authSlice.actions;
export const { cleared, upserted, removed } = reminderSlice.actions;
export const store = configureStore({
  reducer: { auth: authSlice.reducer, reminders: reminderSlice.reducer },
});
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
