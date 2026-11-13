import { deleteFocusDoc, loadFocusDoc, saveFocusDoc } from '../firebase';
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
  try {
    const payload = await loadFocusDoc(userId);
    if (!payload || typeof payload !== 'object') return local;
    const remote = payload as FocusState;
    return { ...EMPTY, ...remote, flags: { ...EMPTY.flags, ...remote.flags } };
  } catch {
    return local;
  }
}

export async function saveFocus(userId: string, state: FocusState): Promise<void> {
  localStorage.setItem(key(userId), JSON.stringify(state));
  try {
    await saveFocusDoc(userId, state);
  } catch (error) {
    console.error('No se pudo guardar Mi Foco:', error);
  }
}

export async function deleteFocus(userId: string): Promise<void> {
  localStorage.removeItem(key(userId));
  try {
    await deleteFocusDoc(userId);
  } catch {
    // El borrado local ya quedó hecho.
  }
}
