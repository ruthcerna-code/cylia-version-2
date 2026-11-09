import { supabase } from '../supabase';
import type { FocusCheckin, FocusFlags, FocusTask } from './logic';

export interface FocusState {
  version: 1;
  consentedAt: string | null;
  flags: FocusFlags;
  notifyTime: string;
  notifyEnabled: boolean;
  ignored: number;
  reduced: boolean;
  shownOn: string[];
  checkins: FocusCheckin[];
  tasks: FocusTask[];
  lightened: { taskId: string; previousDate: string } | null;
}

const EMPTY: FocusState = {
  version: 1,
  consentedAt: null,
  flags: { hormonal: false, irregular: false, menopause: false },
  notifyTime: '09:00',
  notifyEnabled: true,
  ignored: 0,
  reduced: false,
  shownOn: [],
  checkins: [],
  tasks: [],
  lightened: null,
};

function key(userId: string): string {
  return `cyclia_focus_${userId}`;
}

function readLocal(userId: string): FocusState {
  try {
    const raw = localStorage.getItem(key(userId));
    if (!raw) return { ...EMPTY, flags: { ...EMPTY.flags }, checkins: [], tasks: [], shownOn: [] };
    const parsed = JSON.parse(raw) as FocusState;
    return { ...EMPTY, ...parsed, flags: { ...EMPTY.flags, ...parsed.flags } };
  } catch {
    return { ...EMPTY, flags: { ...EMPTY.flags }, checkins: [], tasks: [], shownOn: [] };
  }
}

export async function loadFocus(userId: string): Promise<FocusState> {
  const local = readLocal(userId);
  if (!supabase) return local;
  const { data, error } = await supabase.from('focus_entries').select('payload').eq('user_id', userId).maybeSingle();
  if (error || !data?.payload) return local;
  const remote = data.payload as FocusState;
  return { ...EMPTY, ...remote, flags: { ...EMPTY.flags, ...remote.flags } };
}

export async function saveFocus(userId: string, state: FocusState): Promise<void> {
  localStorage.setItem(key(userId), JSON.stringify(state));
  if (!supabase) return;
  const { error } = await supabase.from('focus_entries').upsert({
    user_id: userId,
    payload: state,
    updated_at: new Date().toISOString(),
  });
  if (error && !/schema cache|does not exist|could not find the table/i.test(error.message)) {
    console.error('No se pudo guardar Mi Foco:', error.message);
  }
}

export async function deleteFocus(userId: string): Promise<void> {
  localStorage.removeItem(key(userId));
  if (!supabase) return;
  await supabase.from('focus_entries').delete().eq('user_id', userId);
}
