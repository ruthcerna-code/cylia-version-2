import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  browserLocalPersistence,
  browserSessionPersistence,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  type Auth,
  type User,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  onSnapshot,
  setDoc,
  type Firestore,
} from 'firebase/firestore';
import type { ActivityImportance, ActivityPlanStatus, ActivityStep, BodyLevel, CervicalFluid, ChatMessage, CycleSymptom, DailyLog, EnergyFeel, FeltState, HormonalMethod, PeriodRecord, PerimenopauseMode, ScheduledActivity, SleepState, SpecialSituation, UserProfile } from './types';
import { compareActivities } from './utils/activities';
import { HORMONAL_LABELS, inferHormonalMethod, validateProfile } from './utils/profileFields';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyB7PrtjPHO6ubosoKF4iKabpm_W9aX3TZQ',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'cyclia-mvp.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'cyclia-mvp',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'cyclia-mvp.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '535794788501',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:535794788501:web:e4fc684808a90543d3539c',
};

export const isFirebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);

const app: FirebaseApp = initializeApp(firebaseConfig);
const auth: Auth = getAuth(app);
const db: Firestore = getFirestore(app);

export type SessionUser = {
  id: string;
  email?: string;
  isAnonymous: boolean;
};

export function toSessionUser(user: { id: string; email?: string | null; isAnonymous?: boolean }): SessionUser {
  return {
    id: user.id,
    email: user.email || undefined,
    isAnonymous: Boolean(user.isAnonymous),
  };
}

export function watchAuth(onUser: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, onUser);
}

export async function currentIdToken(): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('Inicia sesión para continuar.');
  return user.getIdToken();
}

const METHODS = ['ninguna', 'pastilla', 'diu_hormonal', 'implante', 'inyeccion', 'anillo_parche'] as const;
const SITUATIONS = ['ninguna', 'embarazo', 'posparto_lactancia', 'terapia_hormonal', 'sin_regla'] as const;
const PERI_MODES = ['off', 'offered', 'on'] as const;
const SLEEP_STATES = ['bien', 'regular', 'mal'] as const;
const FLUIDS = ['seco', 'pegajoso', 'cremoso', 'clara_de_huevo'] as const;
const FELT_STATES = ['Serena', 'Enfocada', 'Radiante', 'Reflexiva', 'Sensible'] as const;
const ENERGY_FEELS = ['baja', 'estable', 'radiante', 'inquieta'] as const;
const BODY_LEVELS = ['ninguno', 'leve', 'medio'] as const;
const SYMPTOMS = ['colicos', 'dolor_cabeza', 'hinchazon', 'sensibilidad_mamaria', 'antojos', 'irritabilidad', 'bochornos', 'sudores_nocturnos', 'sequedad_vaginal'] as const;
const IMPORTANCE = ['alta', 'media', 'baja'] as const;
const PLAN_STATUS = ['pendiente', 'en_curso', 'hecha', 'pospuesta'] as const;

function oneOf<T extends string>(values: readonly T[], value: unknown): T | undefined {
  return typeof value === 'string' && values.includes(value as T) ? value as T : undefined;
}

function asInt(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : fallback;
}

function clean<T extends Record<string, unknown>>(value: T): T {
  const next = {} as T;
  for (const [key, item] of Object.entries(value)) {
    if (item !== undefined) (next as Record<string, unknown>)[key] = item;
  }
  return next;
}

function firebaseMessage(code: string): string {
  if (/OPERATION_NOT_ALLOWED|operation-not-allowed/i.test(code)) {
    return 'En Firebase falta activar el acceso con correo y contraseña.';
  }
  if (/EMAIL_EXISTS|email-already-in-use/i.test(code)) return 'No reconocemos esa clave.';
  if (/INVALID_PASSWORD|INVALID_LOGIN_CREDENTIALS|wrong-password|invalid-credential/i.test(code)) return 'No reconocemos esa clave.';
  if (/WEAK_PASSWORD|weak-password|al menos 6/i.test(code)) return 'La contraseña debe tener al menos 6 caracteres.';
  if (/INVALID_EMAIL|invalid-email/i.test(code)) return 'El correo no es válido.';
  if (/permission-denied/i.test(code)) return 'Firebase no permitió guardar este dato.';
  return 'No se pudo usar Firebase.';
}

async function identity(path: string, email: string, password: string): Promise<{ ok: boolean; message: string }> {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:${path}?key=${firebaseConfig.apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const body = await response.json().catch(() => ({}));
  return { ok: response.ok, message: String(body?.error?.message || '') };
}

export async function prepareEmailAccount(email: string, password: string): Promise<boolean> {
  if (password.length < 6) throw new Error('La contraseña debe tener al menos 6 caracteres.');
  const signIn = await identity('signInWithPassword', email, password);
  if (signIn.ok) return false;
  const signUp = await identity('signUp', email, password);
  if (signUp.ok) return true;
  if (/EMAIL_EXISTS/i.test(signUp.message)) throw new Error('No reconocemos esa clave.');
  throw new Error(firebaseMessage(signUp.message || signIn.message));
}

export async function openEmailAccount(email: string, password: string, remember: boolean): Promise<void> {
  await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (!/auth\/user-not-found|auth\/invalid-credential/i.test(code)) {
      throw new Error(firebaseMessage(code));
    }
    try {
      await createUserWithEmailAndPassword(auth, email, password);
    } catch (createError) {
      const createCode = createError instanceof Error ? createError.message : '';
      throw new Error(firebaseMessage(createCode));
    }
  }
}

export async function signOut() {
  try {
    await firebaseSignOut(auth);
  } catch {
    // La sesión local se limpia igual.
  }
  window.location.replace('/');
}

function userDoc(userId: string) {
  return doc(db, 'users', userId);
}

function profileToDoc(profile: UserProfile): Record<string, unknown> {
  const method = METHODS.includes(profile.hormonalMethod as HormonalMethod)
    ? profile.hormonalMethod
    : inferHormonalMethod(profile.contraceptive);
  return clean({
    role: 'user',
    name: profile.name,
    age: asInt(profile.age, 0),
    birthDate: profile.birthDate,
    weight: Number(profile.weight),
    height: Number(profile.height),
    email: profile.email || '',
    lastPeriodDate: profile.lastPeriodDate,
    periodLength: asInt(profile.periodLength, 5),
    cycleLength: asInt(profile.cycleLength, 28),
    hormonalMethod: method,
    specialSituation: SITUATIONS.includes(profile.specialSituation as SpecialSituation) ? profile.specialSituation : 'ninguna',
    perimenopauseMode: PERI_MODES.includes(profile.perimenopauseMode as PerimenopauseMode) ? profile.perimenopauseMode : 'off',
    lengthSource: profile.lengthSource === 'records' ? 'records' : 'manual',
    contraceptive: profile.contraceptive || 'Ninguno',
    cycleReminders: Boolean(profile.cycleReminders),
    periodLengthKnown: profile.periodLengthKnown !== false,
    cycleLengthKnown: profile.cycleLengthKnown !== false,
    isCeliac: Boolean(profile.isCeliac),
    hasDiabetes: Boolean(profile.hasDiabetes),
    hasObesity: Boolean(profile.hasObesity),
    hasDepression: Boolean(profile.hasDepression),
  });
}

function docToProfile(data: Record<string, unknown>): UserProfile {
  const method = oneOf<HormonalMethod>(METHODS, data.hormonalMethod) || inferHormonalMethod(String(data.contraceptive || ''));
  return {
    name: String(data.name || ''),
    age: asInt(data.age, 0),
    birthDate: String(data.birthDate || ''),
    weight: Number(data.weight || 0),
    height: Number(data.height || 0),
    email: String(data.email || ''),
    lastPeriodDate: String(data.lastPeriodDate || ''),
    periodLength: asInt(data.periodLength, 5),
    cycleLength: asInt(data.cycleLength, 28),
    contraceptive: method === 'ninguna' ? String(data.contraceptive || 'Ninguno') : HORMONAL_LABELS[method],
    isCeliac: Boolean(data.isCeliac),
    hasDiabetes: Boolean(data.hasDiabetes),
    hasObesity: Boolean(data.hasObesity),
    hasDepression: Boolean(data.hasDepression),
    lengthSource: data.lengthSource === 'records' ? 'records' : 'manual',
    cycleReminders: Boolean(data.cycleReminders),
    hormonalMethod: method,
    specialSituation: oneOf<SpecialSituation>(SITUATIONS, data.specialSituation) || 'ninguna',
    periodLengthKnown: data.periodLengthKnown !== false,
    cycleLengthKnown: data.cycleLengthKnown !== false,
    perimenopauseMode: oneOf<PerimenopauseMode>(PERI_MODES, data.perimenopauseMode) || 'off',
  };
}

function scale(value: unknown): number {
  const number = asInt(value, 3);
  return Math.min(5, Math.max(1, number));
}

function logToDoc(log: DailyLog): Record<string, unknown> {
  return clean({
    date: log.date,
    sleepQuality: scale(log.sleepQuality),
    fatigue: scale(log.fatigue),
    pain: scale(log.pain),
    stress: scale(log.stress),
    mood: scale(log.mood),
    sleepDetails: log.sleepDetails || '',
    additionalNotes: log.additionalNotes || '',
    behavior: log.behavior || '',
    aiAnalysis: log.aiAnalysis || '',
    energy: log.energy == null ? undefined : scale(log.energy),
    concentration: log.concentration == null ? undefined : scale(log.concentration),
    sleepState: oneOf(SLEEP_STATES, log.sleepState),
    spotting: log.spotting,
    symptoms: (log.symptoms || []).filter((item) => SYMPTOMS.includes(item)),
    hotFlashCount: log.hotFlashCount,
    hotFlashIntensity: log.hotFlashIntensity,
    nightSweatCount: log.nightSweatCount,
    nightSweatIntensity: log.nightSweatIntensity,
    cervicalFluid: oneOf(FLUIDS, log.cervicalFluid),
    feltState: oneOf(FELT_STATES, log.feltState),
    energyFeel: oneOf(ENERGY_FEELS, log.energyFeel),
    headache: oneOf(BODY_LEVELS, log.headache),
    bloating: oneOf(BODY_LEVELS, log.bloating),
    breastSensitivity: oneOf(BODY_LEVELS, log.breastSensitivity),
    pelvicCramps: oneOf(BODY_LEVELS, log.pelvicCramps),
  });
}

function docToLog(data: Record<string, unknown>): DailyLog {
  return {
    date: String(data.date || ''),
    sleepQuality: scale(data.sleepQuality),
    fatigue: scale(data.fatigue),
    pain: scale(data.pain),
    stress: scale(data.stress),
    mood: scale(data.mood),
    sleepDetails: String(data.sleepDetails || ''),
    additionalNotes: String(data.additionalNotes || ''),
    behavior: String(data.behavior || ''),
    aiAnalysis: data.aiAnalysis ? String(data.aiAnalysis) : undefined,
    energy: data.energy == null ? undefined : scale(data.energy),
    concentration: data.concentration == null ? undefined : scale(data.concentration),
    sleepState: oneOf<SleepState>(SLEEP_STATES, data.sleepState),
    spotting: typeof data.spotting === 'boolean' ? data.spotting : undefined,
    symptoms: Array.isArray(data.symptoms) ? data.symptoms.filter((item): item is CycleSymptom => SYMPTOMS.includes(item as CycleSymptom)) : [],
    hotFlashCount: data.hotFlashCount == null ? undefined : asInt(data.hotFlashCount, 0),
    hotFlashIntensity: data.hotFlashIntensity == null ? undefined : asInt(data.hotFlashIntensity, 0),
    nightSweatCount: data.nightSweatCount == null ? undefined : asInt(data.nightSweatCount, 0),
    nightSweatIntensity: data.nightSweatIntensity == null ? undefined : asInt(data.nightSweatIntensity, 0),
    cervicalFluid: oneOf<CervicalFluid>(FLUIDS, data.cervicalFluid),
    feltState: oneOf<FeltState>(FELT_STATES, data.feltState),
    energyFeel: oneOf<EnergyFeel>(ENERGY_FEELS, data.energyFeel),
    headache: oneOf<BodyLevel>(BODY_LEVELS, data.headache),
    bloating: oneOf<BodyLevel>(BODY_LEVELS, data.bloating),
    breastSensitivity: oneOf<BodyLevel>(BODY_LEVELS, data.breastSensitivity),
    pelvicCramps: oneOf<BodyLevel>(BODY_LEVELS, data.pelvicCramps),
  };
}

async function guard<T>(action: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    console.error(`Firebase ${action}:`, code);
    throw new Error(firebaseMessage(code));
  }
}

export async function fetchProfile(userId: string): Promise<UserProfile | null> {
  return guard('fetchProfile', async () => {
    const snap = await getDoc(userDoc(userId));
    if (!snap.exists()) return null;
    const data = snap.data();
    if (!data.name) return null;
    return docToProfile(data);
  });
}

export async function saveProfile(userId: string, profile: UserProfile) {
  const problem = validateProfile(profile);
  if (problem) throw new Error(problem);
  await guard('saveProfile', () => setDoc(userDoc(userId), profileToDoc(profile), { merge: true }));
  await rememberPeriodStart(userId, profile.lastPeriodDate);
}

export async function fetchPeriodRecords(userId: string): Promise<PeriodRecord[]> {
  return guard('fetchPeriodRecords', async () => {
    const snap = await getDocs(collection(db, 'users', userId, 'period_records'));
    return snap.docs.map((item) => {
      const data = item.data();
      return {
        id: item.id,
        startDate: String(data.startDate || ''),
        endDate: data.endDate ? String(data.endDate) : null,
        volume: data.volume === 'leve' || data.volume === 'moderado' || data.volume === 'abundante' || data.volume === 'muy_abundante' ? data.volume : null,
        pain: data.pain == null ? null : asInt(data.pain, 0),
      };
    }).sort((a, b) => a.startDate.localeCompare(b.startDate));
  });
}

export async function rememberPeriodStart(userId: string, startDate: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return;
  await guard('rememberPeriodStart', async () => {
    const snap = await getDocs(collection(db, 'users', userId, 'period_records'));
    if (snap.docs.some((item) => item.data().startDate === startDate)) return;
    await setDoc(doc(collection(db, 'users', userId, 'period_records')), {
      startDate,
      endDate: null,
      volume: null,
      pain: null,
    });
  });
}

export async function fetchLogs(userId: string): Promise<Record<string, DailyLog>> {
  return guard('fetchLogs', async () => {
    const snap = await getDocs(collection(db, 'users', userId, 'daily_logs'));
    const logs: Record<string, DailyLog> = {};
    snap.forEach((item) => {
      const log = docToLog(item.data());
      if (log.date) logs[log.date] = log;
    });
    return logs;
  });
}

export async function saveLogs(userId: string, logs: DailyLog[]) {
  if (logs.length === 0) return;
  await guard('saveLogs', async () => {
    for (const log of logs) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(log.date)) throw new Error('La fecha del registro no es válida.');
      await setDoc(doc(db, 'users', userId, 'daily_logs', log.date), logToDoc(log), { merge: true });
    }
  });
}

export async function fetchMessages(userId: string): Promise<ChatMessage[]> {
  return guard('fetchMessages', async () => {
    const snap = await getDocs(collection(db, 'users', userId, 'messages'));
    return snap.docs.map((item) => {
      const data = item.data();
      return {
        id: item.id,
        role: data.role === 'assistant' ? 'assistant' as const : 'user' as const,
        content: String(data.content || ''),
        timestamp: String(data.timestamp || ''),
        createdAt: asInt(data.createdAt, 0),
      };
    }).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  });
}

export async function saveMessage(userId: string, message: ChatMessage) {
  await guard('saveMessage', () => setDoc(doc(db, 'users', userId, 'messages', message.id), clean({
    role: message.role,
    content: message.content,
    timestamp: message.timestamp,
    createdAt: message.createdAt ?? Date.now(),
  })));
}

export async function deleteMessages(userId: string) {
  await guard('deleteMessages', async () => {
    const snap = await getDocs(collection(db, 'users', userId, 'messages'));
    await Promise.all(snap.docs.map((item) => deleteDoc(item.ref)));
  });
}

async function deleteCollection(userId: string, name: string) {
  const snap = await getDocs(collection(db, 'users', userId, name));
  await Promise.all(snap.docs.map((item) => deleteDoc(item.ref)));
}

export async function deleteAccountData(userId: string) {
  await guard('deleteAccountData', async () => {
    await deleteCollection(userId, 'day_plans');
    await deleteCollection(userId, 'activities');
    await deleteCollection(userId, 'messages');
    await deleteCollection(userId, 'period_records');
    await deleteCollection(userId, 'daily_logs');
    await deleteCollection(userId, 'focus');
    await deleteDoc(userDoc(userId));
  });
}

export type ActivityDraft = {
  id?: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  reminderMinutes: number | null;
  notes: string;
  timeZone: string;
  deadline?: string | null;
  estimateMinutes?: number | null;
  importance?: ActivityImportance | null;
  dependsOn?: string | null;
  planStatus?: ActivityPlanStatus;
  sortOrder?: number | null;
  steps?: ActivityStep[];
};

function readSteps(value: unknown): ActivityStep[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const row = item as { action?: unknown; minutes?: unknown; doneWhen?: unknown };
    if (typeof row.action !== 'string' || !row.action.trim()) return [];
    const minutes = Number(row.minutes);
    return [{
      action: row.action.trim(),
      minutes: Number.isFinite(minutes) && minutes > 0 ? minutes : 10,
      doneWhen: typeof row.doneWhen === 'string' ? row.doneWhen : '',
    }];
  });
}

function docToActivity(id: string, data: Record<string, unknown>): ScheduledActivity {
  return {
    id,
    title: String(data.title || ''),
    date: String(data.date || ''),
    startTime: data.startTime ? String(data.startTime).slice(0, 5) : '',
    endTime: data.endTime ? String(data.endTime).slice(0, 5) : '',
    reminderMinutes: data.reminderMinutes == null ? null : asInt(data.reminderMinutes, 0),
    notes: String(data.notes || ''),
    timeZone: String(data.timeZone || 'UTC'),
    syncStatus: 'synced',
    googleEventId: null,
    googleCalendarId: null,
    syncError: null,
    updatedAt: String(data.updatedAt || new Date().toISOString()),
    deadline: data.deadline ? String(data.deadline) : null,
    estimateMinutes: data.estimateMinutes == null ? null : asInt(data.estimateMinutes, 0),
    importance: oneOf<ActivityImportance>(IMPORTANCE, data.importance) || null,
    dependsOn: data.dependsOn ? String(data.dependsOn) : null,
    planStatus: oneOf<ActivityPlanStatus>(PLAN_STATUS, data.planStatus) || 'pendiente',
    sortOrder: data.sortOrder == null ? null : asInt(data.sortOrder, 0),
    steps: readSteps(data.steps),
  };
}

export function activitiesStoredOnThisDevice(): boolean {
  return false;
}

export async function fetchActivities(userId: string): Promise<ScheduledActivity[]> {
  return guard('fetchActivities', async () => {
    const snap = await getDocs(collection(db, 'users', userId, 'activities'));
    return snap.docs.map((item) => docToActivity(item.id, item.data())).sort(compareActivities);
  });
}

export async function saveScheduledActivity(userId: string, draft: ActivityDraft): Promise<ScheduledActivity> {
  return guard('saveActivity', async () => {
    const id = draft.id || crypto.randomUUID();
    const existing = draft.id ? (await getDoc(doc(db, 'users', userId, 'activities', draft.id))).data() : undefined;
    const saved = docToActivity(id, {
      title: draft.title.trim(),
      date: draft.date,
      startTime: draft.startTime || null,
      endTime: draft.endTime || null,
      reminderMinutes: draft.reminderMinutes,
      notes: draft.notes.trim(),
      timeZone: draft.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      updatedAt: new Date().toISOString(),
      deadline: draft.deadline !== undefined ? draft.deadline : existing?.deadline ?? null,
      estimateMinutes: draft.estimateMinutes !== undefined ? draft.estimateMinutes : existing?.estimateMinutes ?? null,
      importance: draft.importance !== undefined ? draft.importance : existing?.importance ?? null,
      dependsOn: draft.dependsOn !== undefined ? draft.dependsOn : existing?.dependsOn ?? null,
      planStatus: draft.planStatus || existing?.planStatus || 'pendiente',
      sortOrder: draft.sortOrder !== undefined ? draft.sortOrder : existing?.sortOrder ?? null,
      steps: draft.steps || readSteps(existing?.steps),
    });
    await setDoc(doc(db, 'users', userId, 'activities', id), clean({
      title: saved.title,
      date: saved.date,
      startTime: saved.startTime || null,
      endTime: saved.endTime || null,
      planStatus: saved.planStatus,
      importance: saved.importance,
      notes: saved.notes,
      reminderMinutes: saved.reminderMinutes,
      timeZone: saved.timeZone,
      updatedAt: saved.updatedAt,
      deadline: saved.deadline,
      estimateMinutes: saved.estimateMinutes,
      dependsOn: saved.dependsOn,
      sortOrder: saved.sortOrder,
      steps: saved.steps,
    }), { merge: true });
    return saved;
  });
}

export async function deleteScheduledActivity(userId: string, activity: ScheduledActivity): Promise<null> {
  await guard('deleteActivity', () => deleteDoc(doc(db, 'users', userId, 'activities', activity.id)));
  return null;
}

export function subscribeUserData(userId: string, onChange: () => void) {
  const stops = [
    onSnapshot(userDoc(userId), onChange, () => undefined),
    onSnapshot(collection(db, 'users', userId, 'daily_logs'), onChange, () => undefined),
    onSnapshot(collection(db, 'users', userId, 'messages'), onChange, () => undefined),
  ];
  return () => stops.forEach((stop) => stop());
}

export async function loadDayPlan(userId: string, date: string): Promise<Record<string, unknown> | null> {
  const snap = await getDoc(doc(db, 'users', userId, 'day_plans', date));
  return snap.exists() ? snap.data() : null;
}

export async function saveDayPlan(userId: string, date: string, availableMinutes: number, reportedEnergy: number | null, reportedFeel: string | null) {
  await setDoc(doc(db, 'users', userId, 'day_plans', date), clean({
    planDate: date,
    availableMinutes: asInt(availableMinutes, 0),
    bufferMinutes: 30,
    reportedEnergy,
    reportedFeel,
  }), { merge: true });
}

export async function loadFocusDoc(userId: string): Promise<unknown> {
  const snap = await getDoc(doc(db, 'users', userId, 'focus', 'state'));
  return snap.exists() ? snap.data().payload : null;
}

export async function saveFocusDoc(userId: string, payload: unknown) {
  await setDoc(doc(db, 'users', userId, 'focus', 'state'), {
    payload,
    updatedAt: new Date().toISOString(),
  });
}

export async function deleteFocusDoc(userId: string) {
  await deleteDoc(doc(db, 'users', userId, 'focus', 'state'));
}
