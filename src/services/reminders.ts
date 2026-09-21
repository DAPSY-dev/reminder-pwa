import { database } from '../lib/supabase';
import type { Reminder, ReminderInput, ReminderStatus } from '../types/models';

export const reminderService = {
  async list(): Promise<Reminder[]> {
    const { data, error } = await database()
      .from('reminders')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data as Reminder[];
  },
  async save(input: ReminderInput, userId: string, id?: string): Promise<Reminder> {
    const query = id
      ? database().from('reminders').update(input).eq('id', id)
      : database()
          .from('reminders')
          .insert({ ...input, user_id: userId });
    const { data, error } = await query.select('*').single();
    if (error) throw error;
    return data as Reminder;
  },
  async status(id: string, status: ReminderStatus): Promise<Reminder> {
    const { data, error } = await database()
      .from('reminders')
      .update({ status })
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return data as Reminder;
  },
  async remove(id: string): Promise<void> {
    const { error } = await database().from('reminders').delete().eq('id', id);
    if (error) throw error;
  },
};
