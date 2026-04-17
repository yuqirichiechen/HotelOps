import { supabase } from '../lib/supabase';

export const lookupEmployee = async (phoneNumber) => {
  const { data, error } = await supabase
    .from('users')
    .select('user_id, name, phone_number, role, hire_date')
    .eq('phone_number', phoneNumber)
    .eq('active', true)
    .single();

  if (error || !data) {
    return { success: false, message: 'Employee not found' };
  }
  return { success: true, employee: data };
};

export const clockIn = async (userId) => {
  const { data: open } = await supabase
    .from('time_entries')
    .select('entry_id')
    .eq('user_id', userId)
    .is('clock_out_time', null)
    .maybeSingle();

  if (open) {
    return { success: false, message: 'You are already clocked in' };
  }

  const { data, error } = await supabase
    .from('time_entries')
    .insert({ user_id: userId, clock_in_time: new Date().toISOString() })
    .select()
    .single();

  if (error) return { success: false, message: 'Clock-in failed' };
  return { success: true, entry: data };
};

export const clockOut = async (userId) => {
  const { data: open } = await supabase
    .from('time_entries')
    .select('entry_id')
    .eq('user_id', userId)
    .is('clock_out_time', null)
    .order('clock_in_time', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!open) {
    return { success: false, message: 'You are not currently clocked in' };
  }

  const { data, error } = await supabase
    .from('time_entries')
    .update({ clock_out_time: new Date().toISOString() })
    .eq('entry_id', open.entry_id)
    .select()
    .single();

  if (error) return { success: false, message: 'Clock-out failed' };
  return { success: true, entry: data };
};
