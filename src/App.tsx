import React, { useState, useEffect, useRef } from 'react';
import { UserProfile, DailyLog, ChatMessage, MenstrualPhase } from './types';
import Onboarding from './components/Onboarding';
import { EntryFlow, MoodGrid, ObjectivesScreen, RegionScreen } from './components/EntryFlow';
import DesignHome from './components/DesignHome';
import DesignRegister from './components/DesignRegister';
import { ActivityScreen, CycleDataScreen, DataPrivacyGate, GoalsScreen, PhaseScreen, PrivacyScreen } from './components/DesignScreens';
import CalendarView from './components/CalendarView';
import DailyCheckin from './components/DailyCheckin';
import ChatPanel from './components/ChatPanel';
import HealthProfileModal from './components/HealthProfileModal';
import SymptomChart from './components/SymptomChart';
import { getCycleDay, getPhaseForDay, formatDateStr, formatFriendlyDate, PHASE_DETAILS } from './utils/cycle';
import { generateActivityForDay } from './utils/activity';
import {
  deleteAccountData,
  deleteMessages,
  fetchLogs,
  fetchMessages,
  fetchProfile,
  isSupabaseConfigured,
  saveLogs,
  saveMessage,
  saveProfile,
  signInAnonymously,
  canSeeRegisteredData,
  signInWithEmail,
  connectGoogle,
  signInWithGoogle,
  toSessionUser,
  signOut,
  signUpWithEmail,
  subscribeUserData,
  supabase,
  type SessionUser,
} from './supabase';

const SCALE_LABELS = {
  sleep: ["Excelente", "Buena", "Regular", "Mala", "Muy mala"],
  fatigue: ["Ninguna", "Leve", "Moderada", "Alta", "Extrema"],
  pain: ["Ninguno", "Leve", "Moderado", "Alto", "Muy alto"],
  stress: ["Muy bajo", "Bajo", "Moderado", "Alto", "Muy alto"],
  mood: ["Muy feliz", "Bien", "Neutral", "Triste", "Muy triste"]
};

type MigrationResult = 'empty' | 'ok' | 'error';

function listLogs(source: Record<string, DailyLog>): DailyLog[] {
  return Object.values(source) as DailyLog[];
}

function withoutAnalysis(log: DailyLog): DailyLog {
  const next: DailyLog = { ...log };
  delete next.aiAnalysis;
  return next;
}

async function migrateLocalGuestProfile(uid: string): Promise<MigrationResult> {
  const raw = localStorage.getItem('cyclia_guest_profile');
  if (!raw) return 'empty';
  try {
    const profile = JSON.parse(raw) as UserProfile;
    await saveProfile(uid, profile);
    const logsRaw = localStorage.getItem('cyclia_guest_logs');
    if (logsRaw) {
      const logs = JSON.parse(logsRaw) as Record<string, DailyLog>;
      await saveLogs(uid, Object.values(logs));
    }
    localStorage.removeItem('cyclia_guest_profile');
    localStorage.removeItem('cyclia_guest_logs');
    localStorage.removeItem('cyclia_session_type');
    return 'ok';
  } catch (error) {
    console.error('No se pudo migrar el perfil local:', error);
    return 'error';
  }
}

async function migrateLocalChat(uid: string): Promise<MigrationResult> {
  const raw = localStorage.getItem(`cyclia_chat_${uid}`) || localStorage.getItem('cyclia_chat_guest_local');
  if (!raw) return 'empty';
  try {
    const parsed = JSON.parse(raw) as ChatMessage[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      localStorage.removeItem(`cyclia_chat_${uid}`);
      localStorage.removeItem('cyclia_chat_guest_local');
      return 'empty';
    }
    const base = Date.now() - parsed.length;
    for (let index = 0; index < parsed.length; index += 1) {
      const msg = parsed[index];
      await saveMessage(uid, { ...msg, createdAt: msg.createdAt ?? base + index });
    }
    localStorage.removeItem(`cyclia_chat_${uid}`);
    localStorage.removeItem('cyclia_chat_guest_local');
    return 'ok';
  } catch (error) {
    console.error('No se pudo migrar el chat local:', error);
    return 'error';
  }
}

export default function App() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [logs, setLogs] = useState<Record<string, DailyLog>>({});
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [selectedDateStr, setSelectedDateStr] = useState<string>(formatDateStr(new Date()));
  const [isCheckinOpen, setIsCheckinOpen] = useState(false);
  const [isAnalysisOpen, setIsAnalysisOpen] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState('');
  const [showNotification, setShowNotification] = useState(false);
  const [notificationMsg, setNotificationMsg] = useState('');
  const [appTab, setAppTab] = useState<'inicio' | 'calendario' | 'registro' | 'chat' | 'humor' | 'perfil'>('inicio');
  const [homeSheet, setHomeSheet] = useState<null | 'fase' | 'actividad'>(null);
  const [cycleSheet, setCycleSheet] = useState<null | 'dia' | 'evolucion'>(null);
  const [profileSheet, setProfileSheet] = useState<null | 'ciclo' | 'objetivos' | 'privacidad'>(null);
  const [chatHistoryOpen, setChatHistoryOpen] = useState(false);
  const [region, setRegion] = useState<string | null>(() => localStorage.getItem('cyclia_region'));
  const [objectivesDone, setObjectivesDone] = useState(() => localStorage.getItem('cyclia_objectives_done') === '1');
  const [savedGoals, setSavedGoals] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('cyclia_objectives') || '[]'); } catch { return []; }
  });
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('cyclia_theme') === 'dark');
  const [isEditingHealth, setIsEditingHealth] = useState(false);

  // AntiGravity Agent states
  const [previousInteractionId, setPreviousInteractionId] = useState<string | null>(() => localStorage.getItem('cyclia_prev_interaction_id'));
  const [environmentId, setEnvironmentId] = useState<string | null>(() => localStorage.getItem('cyclia_environment_id'));
  const [agentSteps, setAgentSteps] = useState<any[]>([]);

  // AntiGravity helper state update
  const updateAgentState = (interId?: string, envId?: string, steps?: any[]) => {
    if (interId) {
      setPreviousInteractionId(interId);
      localStorage.setItem('cyclia_prev_interaction_id', interId);
    }
    if (envId) {
      setEnvironmentId(envId);
      localStorage.setItem('cyclia_environment_id', envId);
    }
    if (steps) {
      setAgentSteps(steps);
    }
  };

  // Authentication Panel States
  const [gmailError, setGmailError] = useState('');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [isSignUpMode, setIsSignUpMode] = useState(false);
  const [authPanelError, setAuthPanelError] = useState('');
  const [isAuthProcessing, setIsAuthProcessing] = useState(false);

  const guestMigrationStarted = useRef(false);
  const chatMigrationStarted = useRef(false);

  useEffect(() => {
    document.documentElement.dataset.theme = darkMode ? 'dark' : 'light';
    localStorage.setItem('cyclia_theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  const handleConnectGoogle = async () => {
    setGmailError('');
    try {
      await connectGoogle(Boolean(user?.isAnonymous));
    } catch (err: any) {
      setGmailError(err?.message || 'No se pudo abrir Gmail.');
    }
  };

  const showNotice = (message: string) => {
    setNotificationMsg(message);
    setShowNotification(true);
    window.setTimeout(() => setShowNotification(false), 4000);
  };

  useEffect(() => {
    if (!supabase) {
      setIsLoadingAuth(false);
      return;
    }
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      const sessionUser = data.session?.user;
      setUser(sessionUser ? toSessionUser(sessionUser) : null);
      if (!sessionUser) setIsLoadingAuth(false);
      const oauthError = new URLSearchParams(window.location.search).get('error_description')
        || new URLSearchParams(window.location.search).get('error');
      if (oauthError) {
        const text = decodeURIComponent(oauthError.replace(/\+/g, ' '));
        setAuthPanelError(text);
        setGmailError(text);
      }
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      if (session?.user) {
        setUser(toSessionUser(session.user));
        setIsLoadingAuth(true);
      } else {
        setUser(null);
        setProfile(null);
        setLogs({});
        setChatHistory([]);
        setIsLoadingAuth(false);
      }
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    const uid = user.id;
    let cancelled = false;
    guestMigrationStarted.current = false;
    chatMigrationStarted.current = false;

    const refresh = async () => {
      try {
        const [profileRow, logRows, messageRows] = await Promise.all([
          fetchProfile(uid),
          fetchLogs(uid),
          fetchMessages(uid),
        ]);
        if (cancelled) return;

        if (!profileRow && !guestMigrationStarted.current) {
          guestMigrationStarted.current = true;
          const result = await migrateLocalGuestProfile(uid);
          if (cancelled) return;
          if (result === 'error') showNotice('No se pudieron migrar los datos locales a Supabase.');
          if (result === 'ok') {
            await refresh();
            return;
          }
        }

        if (messageRows.length === 0 && !chatMigrationStarted.current) {
          chatMigrationStarted.current = true;
          const result = await migrateLocalChat(uid);
          if (cancelled) return;
          if (result === 'error') showNotice('No se pudo migrar el chat a Supabase.');
          if (result === 'ok') {
            await refresh();
            return;
          }
        }

        setProfile(profileRow);
        setLogs(logRows);
        setChatHistory(messageRows);
        setIsLoadingAuth(false);
      } catch (error) {
        console.error('No se pudieron leer los datos de Supabase:', error);
        if (!cancelled) {
          setProfile(null);
          setIsLoadingAuth(false);
          showNotice('No se pudieron leer los datos en Supabase.');
        }
      }
    };

    void refresh();
    const unsubscribe = subscribeUserData(uid, () => {
      void refresh();
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [user]);

  const handleSaveProfile = async (newProfile: UserProfile) => {
    if (!user) return false;
    const isFirstProfile = !profile;
    setProfile(newProfile);

    try {
      await saveProfile(user.id, newProfile);
    } catch (error) {
      console.error('No se pudo guardar el perfil:', error);
      showNotice('No se pudo guardar el perfil en Supabase.');
      return false;
    }

    if (!isFirstProfile) return true;

    const welcomeMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: `🌸 ¡Hola ${newProfile.name}! He registrado con éxito tu perfil en Cyclia.\n\nHe calculado tu ciclo biológico basándome en tu última fecha menstrual (${newProfile.lastPeriodDate}).\n\nTu calendario ya está actualizado con tus fases. ¿En qué puedo ayudarte hoy?`,
      timestamp: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
      createdAt: Date.now(),
    };
    setChatHistory([welcomeMsg]);
    try {
      await saveMessage(user.id, welcomeMsg);
    } catch (error) {
      console.error('No se pudo guardar el mensaje de bienvenida:', error);
    }
    return true;
  };

  // Sync logs to Supabase
  const handleSaveLog = async (log: DailyLog, options?: { analyze?: boolean }) => {
    if (!user) return;

    const logWithClearedAnalysis = withoutAnalysis(log);
    const updatedLogs = { ...logs, [log.date]: logWithClearedAnalysis };
    const previousLog = logs[log.date];
    setLogs(updatedLogs);
    setIsCheckinOpen(false);

    try {
      await saveLogs(user.id, [logWithClearedAnalysis]);
    } catch (error) {
      console.error('No se pudo guardar el registro:', error);
      setLogs((current) => {
        const next = { ...current };
        if (previousLog) next[log.date] = previousLog;
        else delete next[log.date];
        return next;
      });
      showNotice('No se pudo guardar el registro en Supabase.');
      return;
    }
    
    const analyze = options?.analyze !== false;
    setNotificationMsg(analyze ? "¡Registro guardado! Generando nuevo análisis..." : "Registro guardado.");
    setShowNotification(true);
    setTimeout(() => setShowNotification(false), 4000);

    if (!analyze) return;

    // Trigger AI analysis with the cleared log
    triggerAiAnalysis(logWithClearedAnalysis, updatedLogs);

    // Automatically open the analysis modal to show the progress spinner
    setIsAnalysisOpen(true);
  };

  // Automatically trigger AI Analysis after check-in for deep insights
  const triggerAiAnalysis = async (currentLog: DailyLog, allLogs: Record<string, DailyLog>) => {
    if (!user) return;
    setIsAnalyzing(true);
    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile,
          log: currentLog,
          history: listLogs(allLogs)
            .filter(l => l.date !== currentLog.date)
            .slice(-4) // Send recent 4 logs
        })
      });

      if (response.ok) {
        const data = await response.json();
        if (typeof data.analysis !== 'string' || !data.analysis) return;
        const updatedLog = { ...currentLog, aiAnalysis: data.analysis };
        try {
          await saveLogs(user.id, [updatedLog]);
        } catch (error) {
          console.error('No se pudo guardar el análisis:', error);
          showNotice('El análisis se generó, pero no se pudo guardar en Supabase.');
        }
      }
    } catch (err) {
      console.error("Error auto-generando análisis IA:", err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Request analysis manually if cached analysis is empty
  const handleRequestAnalysisManually = async () => {
    if (!user) return;
    const activeLog = logs[selectedDateStr];
    if (!activeLog) return;

    setIsAnalyzing(true);
    setAnalysisError('');
    setIsAnalysisOpen(true);

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile,
          log: activeLog,
          history: listLogs(logs)
            .filter(l => l.date !== selectedDateStr)
            .slice(-4),
          previousInteractionId,
          environmentId,
        })
      });

      if (!response.ok) {
        throw new Error("No se pudo obtener el análisis. Verifica tu conexión.");
      }

      const data = await response.json();
      const updatedLog = { ...activeLog, aiAnalysis: data.analysis };
      
      if (data.usingAgent) {
        updateAgentState(data.interactionId, data.environmentId, data.steps);
      }

      if (typeof updatedLog.aiAnalysis !== 'string' || !updatedLog.aiAnalysis) {
        throw new Error('La IA no devolvió un análisis.');
      }
      try {
        await saveLogs(user.id, [updatedLog]);
      } catch (error) {
        console.error('No se pudo guardar el análisis:', error);
        throw new Error('No se pudo guardar el análisis en Supabase.');
      }
    } catch (err: any) {
      setAnalysisError(err.message || "Error al conectar con la IA de Cyclia.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleAddMessage = async (msg: ChatMessage) => {
    if (!user) return;
    const stored: ChatMessage = { ...msg, createdAt: msg.createdAt ?? Date.now() };
    setChatHistory((prev) => [...prev, stored]);
    try {
      await saveMessage(user.id, stored);
    } catch (error) {
      console.error('No se pudo guardar el mensaje:', error);
      showNotice('No se pudo guardar el mensaje en Supabase.');
    }
  };

  const handleClearHistory = async () => {
    if (!user) return;
    if (!confirm("¿Estás segura de que deseas limpiar la conversación actual con Cyclia?")) return;
    try {
      await deleteMessages(user.id);
      localStorage.removeItem(`cyclia_chat_${user.id}`);
      setChatHistory([]);
    } catch (error) {
      console.error('No se pudo borrar el chat:', error);
      showNotice('No se pudo borrar el chat en Supabase.');
    }
  };

  const handleResetAppData = async () => {
    if (!user) return;
    if (!confirm("⚠️ ¿Deseas eliminar todo tu perfil y registros históricos para empezar de nuevo?")) return;
    try {
      await deleteAccountData(user.id);
      localStorage.removeItem(`cyclia_chat_${user.id}`);
      setProfile(null);
      setLogs({});
      setChatHistory([]);
      setSelectedDateStr(formatDateStr(new Date()));
    } catch (error) {
      console.error('No se pudieron borrar los datos:', error);
      showNotice('No se pudieron borrar los datos en Supabase.');
    }
  };

  // Load 15 days of authentic, phase-aligned historical logs for testing the graph
  const handleLoadDemoData = async () => {
    if (!profile || !user) return;
    
    const today = new Date();
    const updatedLogs = { ...logs };
    const demoLogs: DailyLog[] = [];
    
    // Generate logs for the last 15 days to make a gorgeous chart curve!
    for (let i = 15; i >= 1; i--) {
      const date = new Date();
      date.setDate(today.getDate() - i);
      const dateStr = formatDateStr(date);
      
      const cycleDay = getCycleDay(dateStr, profile.lastPeriodDate, profile.cycleLength);
      const phase = getPhaseForDay(cycleDay, profile.periodLength, profile.cycleLength);
      
      let sleepQuality = 2;
      let fatigue = 2;
      let pain = 1;
      let stress = 2;
      let mood = 2;
      let behavior = '';
      
      if (phase === 'Menstrual') {
        sleepQuality = 4; // Mala
        fatigue = 4; // Fuerte fatigue
        pain = 4; // Alto dolor
        stress = 3; // Moderado stress
        mood = 4; // Triste
        behavior = "Hice estiramientos suaves y yoga restaurativo, tomé una infusión de manzanilla caliente y dormí temprano para calmar los cólicos menstruales.";
      } else if (phase === 'Folicular') {
        sleepQuality = 1; // Excelente
        fatigue = 1; // Ninguna fatigue
        pain = 1; // Ninguno
        stress = 1; // Muy bajo
        mood = 1; // Muy feliz
        behavior = "Hice entrenamiento de fuerza pesada, comí alimentos ricos en hierro y fibra, y estuve muy enfocada en mis proyectos de trabajo.";
      } else if (phase === 'Ovulacion') {
        sleepQuality = 1; // Excelente
        fatigue = 1; // Ninguna
        pain = 1; // Ninguno
        stress = 2; // Bajo
        mood = 1; // Muy feliz
        behavior = "Hice una sesión cardiovascular intensa al aire libre, tomé suficiente agua y me reuní con amigas, sintiéndome con mucha confianza y energía.";
      } else { // Luteal
        sleepQuality = 3; // Regular
        fatigue = 3; // Moderada
        pain = 2; // Leve
        stress = 4; // Alto stress (PMS)
        mood = 3; // Neutral
        behavior = "Opté por una caminata de 30 minutos a paso ligero para drenar la ansiedad, evité la cafeína y medité por la noche antes de dormir.";
      }
      
      // Adapt based on user's illness/health profile to make it even more realistic!
      if (profile.isCeliac) {
        behavior += " Me aseguré de que todas mis comidas fueran 100% libres de gluten.";
      }
      if (profile.hasDiabetes) {
        behavior += " Monitoreé mis niveles de glucosa y evité carbohidratos refinados.";
      }
      if (profile.hasObesity) {
        behavior += " Caminé más de 10,000 pasos hoy y cuidé el tamaño de mis porciones.";
      }
      if (profile.hasDepression) {
        behavior += " Escribí en mi diario de gratitud y tomé mi tiempo de relajación.";
      }

      const logDoc: DailyLog = {
        date: dateStr,
        sleepQuality,
        fatigue,
        pain,
        stress,
        mood,
        sleepDetails: sleepQuality <= 2 ? "Dormí de corrido toda la noche" : "Me costó conciliar el sueño al principio",
        additionalNotes: "Registro automático de demostración histórica.",
        behavior,
        aiAnalysis: `### Análisis de Tendencia - Fase ${phase}
Basado en tus registros de la fase **${phase}** (Día ${cycleDay} del ciclo), tu cuerpo está respondiendo de manera típica. Los niveles de dolor y fatiga se correlacionan directamente con tus fluctuaciones hormonales.`
      };

      updatedLogs[dateStr] = logDoc;
      demoLogs.push(logDoc);
    }

    setLogs(updatedLogs);
    try {
      await saveLogs(user.id, demoLogs);
    } catch (error) {
      console.error('No se pudieron guardar los registros de demostración:', error);
      showNotice('No se pudieron guardar los registros de demostración en Supabase.');
      return;
    }

    setNotificationMsg("¡Se han cargado 15 días de registros históricos de demostración!");
    setShowNotification(true);
    setTimeout(() => setShowNotification(false), 4000);
  };

  // Open Daily Check-in modal to re-register symptoms and trigger a new analysis
  const handleReRegister = () => {
    setIsCheckinOpen(true);
  };

  // Detect Alerts (Consecutive high ratings in stress/pain/fatigue/poor sleep)
  const checkAlerts = (): boolean => {
    const logList = listLogs(logs).sort((a, b) => b.date.localeCompare(a.date));
    if (logList.length < 3) return false;

    // Check last 3 logs
    const recent = logList.slice(0, 3);
    const highStress = recent.every(l => l.stress >= 4);
    const highPain = recent.every(l => l.pain >= 4);
    const highFatigue = recent.every(l => l.fatigue >= 4);
    const poorSleep = recent.every(l => l.sleepQuality >= 4);

    return highStress || highPain || highFatigue || poorSleep;
  };

  // Check if they registered a new period to recalculate lastPeriodDate
  const handleUpdatePeriodStart = async (newDateStr: string) => {
    if (!profile || !user) return;
    if (confirm(`¿Confirmas que deseas registrar el primer día de tu ciclo menstrual en la fecha ${newDateStr}? Esto actualizará las fases y cálculos.`)) {
      const updatedProfile = { ...profile, lastPeriodDate: newDateStr };
      const saved = await handleSaveProfile(updatedProfile);
      if (!saved) return;
      
      // Clear old cached AI analyses of the logs to prevent stale advice
      const updatedLogs = { ...logs };
      const clearedLogs = listLogs(updatedLogs).map((entry) => {
        const logWithClearedAnalysis = { ...entry };
        delete logWithClearedAnalysis.aiAnalysis;
        updatedLogs[entry.date] = logWithClearedAnalysis;
        return logWithClearedAnalysis;
      });
      setLogs(updatedLogs);

      try {
        await saveLogs(user.id, clearedLogs);
      } catch (error) {
        console.error('No se pudieron limpiar los análisis:', error);
        showNotice('El ciclo se actualizó, pero no se pudieron limpiar los análisis en Supabase.');
        return;
      }

      setNotificationMsg("¡Ciclo recalculado con éxito!");
      setShowNotification(true);
      setTimeout(() => setShowNotification(false), 3000);
    }
  };

  if (isLoadingAuth && !user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#2E37B0] p-6 text-center text-white">
        <h2 className="font-serif text-4xl font-light tracking-[0.16em] text-[#F9C4C6]">CYCLIA</h2>
        <p className="mt-3 text-sm text-[#D2DDF8]">Preparando tu espacio</p>
      </div>
    );
  }

  if (!user) {
    const handleEmailAuth = async (e: React.FormEvent) => {
      e.preventDefault();
      setAuthPanelError('');
      setIsAuthProcessing(true);
      try {
        if (isSignUpMode) {
          await signUpWithEmail(loginEmail, loginPassword);
        } else {
          await signInWithEmail(loginEmail, loginPassword);
        }
      } catch (err: any) {
        console.error("Error de autenticación:", err);
        setAuthPanelError(err?.message || "Ocurrió un error. Verifica tus credenciales.");
      } finally {
        setIsAuthProcessing(false);
      }
    };

    const handleGoogleAuth = async () => {
      setAuthPanelError('');
      setIsAuthProcessing(true);
      try {
        await signInWithGoogle();
      } catch (err: any) {
        console.error('Error en acceso con Gmail:', err);
        setAuthPanelError(err?.message || 'No se pudo iniciar sesión con Gmail.');
        setIsAuthProcessing(false);
      }
    };

    const handleGuestAuth = async () => {
      setAuthPanelError('');
      setIsAuthProcessing(true);
      try {
        await signInAnonymously();
      } catch (err: any) {
        console.error("Error en acceso anónimo:", err);
        setAuthPanelError(err?.message || 'No se pudo iniciar la sesión anónima en Supabase.');
      } finally {
        setIsAuthProcessing(false);
      }
    };

    return (
      <EntryFlow
        configured={isSupabaseConfigured}
        processing={isAuthProcessing}
        error={authPanelError}
        email={loginEmail}
        password={loginPassword}
        signUp={isSignUpMode}
        onEmailChange={setLoginEmail}
        onPasswordChange={setLoginPassword}
        onToggleSignUp={() => { setIsSignUpMode(!isSignUpMode); setAuthPanelError(''); }}
        onGoogle={handleGoogleAuth}
        onAnonymous={handleGuestAuth}
        onEmailSubmit={handleEmailAuth}
      />
    );
  }

  if (!region) {
    return (
      <RegionScreen onSelect={(nextRegion) => {
        localStorage.setItem('cyclia_region', nextRegion);
        setRegion(nextRegion);
      }} />
    );
  }

  if (!objectivesDone) {
    return (
      <ObjectivesScreen onSave={(goals) => {
        localStorage.setItem('cyclia_objectives', JSON.stringify(goals));
        localStorage.setItem('cyclia_objectives_done', '1');
        setSavedGoals(goals);
        setObjectivesDone(true);
      }} />
    );
  }

  if (!profile) {
    return (
      <Onboarding
        onComplete={handleSaveProfile}
        accountEmail={user.email}
        gmailConnected={user.hasGoogle}
        gmailError={gmailError}
        onConnectGoogle={handleConnectGoogle}
      />
    );
  }

  // Calculate current state metrics based on active selection date
  const selectedCycleDay = getCycleDay(selectedDateStr, profile.lastPeriodDate, profile.cycleLength);
  const selectedPhase = getPhaseForDay(selectedCycleDay, profile.periodLength, profile.cycleLength);
  const phaseDetails = PHASE_DETAILS[selectedPhase];
  const activeLog = logs[selectedDateStr];

  const selectedActivity = generateActivityForDay(
    profile.name,
    selectedPhase,
    selectedCycleDay,
    {
      isCeliac: profile.isCeliac,
      hasDiabetes: profile.hasDiabetes,
      hasObesity: profile.hasObesity,
      hasDepression: profile.hasDepression
    }
  );

  return (
    <div className="min-h-dvh text-[#1B1F5E] font-sans flex justify-center bg-transparent">
    <div className="w-full max-w-[480px] min-h-dvh relative flex flex-col pb-24 bg-transparent">
      
      {/* Toast Notification */}
      {showNotification && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 bg-[#1E5631] text-white py-3 px-6 rounded-full shadow-lg border border-white/15 text-xs font-semibold tracking-wider uppercase z-50 flex items-center gap-2 animate-fade-in">
          🌸 {notificationMsg}
        </div>
      )}

      {gmailError && <p className="bg-[#F49A9E] px-5 py-2 text-xs text-[#1B1F5E]">{gmailError}</p>}

      {/* Main Content Area */}
      <main className={`flex-1 w-full flex flex-col gap-4 ${!canSeeRegisteredData(user) || (appTab === 'inicio' && !homeSheet) ? '' : 'px-4 py-4'}`}>
        {!canSeeRegisteredData(user) ? (
          <DataPrivacyGate onConnect={() => { void handleConnectGoogle(); }} />
        ) : (<>
        {appTab === 'inicio' && homeSheet === 'fase' && (
          <PhaseScreen current={selectedPhase} onBack={() => setHomeSheet(null)} />
        )}
        {appTab === 'inicio' && homeSheet === 'actividad' && (
          <ActivityScreen
            phaseName={selectedActivity.phaseName}
            title={selectedActivity.title}
            why={selectedActivity.why}
            steps={phaseDetails.tips}
            notes={selectedActivity.illnessNotes}
            onBack={() => setHomeSheet(null)}
            onAsk={() => { setHomeSheet(null); setAppTab('chat'); }}
          />
        )}
        {appTab === 'inicio' && !homeSheet && (
          <DesignHome
            name={profile.name}
            dateLabel={formatFriendlyDate(selectedDateStr)}
            todayStr={selectedDateStr}
            cycleDay={selectedCycleDay}
            cycleLength={profile.cycleLength}
            periodLength={profile.periodLength}
            lastPeriodDate={profile.lastPeriodDate}
            phase={selectedPhase}
            activityTitle={selectedActivity.title}
            onOpenPhase={() => setHomeSheet('fase')}
            onRegister={() => setAppTab('registro')}
            onChat={() => { setHomeSheet(null); setAppTab('chat'); }}
            onMood={() => { setHomeSheet(null); setAppTab('humor'); }}
            onActivity={() => setHomeSheet('actividad')}
            onCalendar={() => { setHomeSheet(null); setAppTab('calendario'); }}
          />
        )}
        {false && appTab === 'inicio' && (
          <article className="rounded-[32px] border border-[#d7e6d4] bg-white px-7 py-10 text-center shadow-[0_12px_40px_rgba(30,86,49,0.08)]">
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full text-4xl" style={{ background: 'var(--menthe)' }}>🌸</div>
            <h2 className="font-serif text-4xl leading-tight text-[#1E5631]">Bienvenida a Cyclia</h2>
            <p className="mt-4 text-[15px] leading-relaxed text-[#1B4D3E]">
              Hola, {profile.name}. Tu canal de bienestar está listo para el registro de hoy.
            </p>
            <div className="mt-6 rounded-2xl px-4 py-4 text-left text-sm leading-relaxed text-[#1E5631]" style={{ background: 'var(--menthe)' }}>
              <strong>Privacidad absoluta.</strong> Tus datos se almacenan de forma privada y solo se usan para personalizar tu bienestar.
            </div>
            <button type="button" onClick={() => setIsCheckinOpen(true)} className="btn-emeraude mt-8 w-full cursor-pointer rounded-full py-4 text-base font-semibold">
              Comenzar registro
            </button>
          </article>
        )}
        {false && (
          <div className="rounded-[28px] p-5 text-white" style={{ background: 'var(--emeraude)' }}>
            <p className="text-[10px] uppercase tracking-[0.18em] text-white/70">Progreso diario</p>
            <div className="mt-2 flex items-end justify-between">
              <h2 className="font-serif text-4xl">🔥 {Object.keys(logs).length}</h2>
              <p className="text-xs text-white/80 text-right">registros<br />en tu historial</p>
            </div>
            <p className="text-sm mt-3 text-white/90">Hoy tu foco es {savedGoals.length ? savedGoals.join(', ') : 'bienestar'}.</p>
          </div>
        )}
        {false && (
          <div className="rounded-[28px] p-5" style={{ background: 'var(--menthe)' }}>
            <h3 className="font-semibold" style={{ color: 'var(--emeraude)' }}>Hábitos de hoy</h3>
            <ul className="mt-3 space-y-2">
              {phaseDetails.tips.slice(0, 3).map((tip) => (
                <li key={tip} className="flex items-start gap-2 text-sm" style={{ color: 'var(--emeraude-deep)' }}>
                  <span>{activeLog ? '✓' : '○'}</span>
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
            <button type="button" onClick={() => setAppTab('registro')} className="btn-fucsia mt-4 w-full rounded-full py-3 text-sm font-semibold cursor-pointer">
              {activeLog ? 'Ver registro' : 'Registrar hoy'}
            </button>
          </div>
        )}
        {appTab === 'registro' && (
          <DesignRegister
            dateStr={selectedDateStr}
            dateLabel={formatFriendlyDate(selectedDateStr)}
            phaseLabel={phaseDetails.name}
            cycleDay={selectedCycleDay}
            existing={activeLog}
            onSave={(log) => { void handleSaveLog(log, { analyze: false }); }}
            onSaveAndAnalyze={(log) => { void handleSaveLog(log); }}
          />
        )}
        {appTab === 'humor' && (
          <MoodGrid
            current={activeLog?.mood}
            onBack={() => setAppTab('inicio')}
            onFull={() => setAppTab('registro')}
            onSave={(mood, tags) => {
              const previous = (activeLog?.additionalNotes || '').replace(/\n?Influye:.*$/s, '').trim();
              const tagLine = tags.length ? `Influye: ${tags.join(', ')}` : '';
              handleSaveLog({
                date: selectedDateStr,
                sleepQuality: activeLog?.sleepQuality || 3,
                fatigue: activeLog?.fatigue || 3,
                pain: activeLog?.pain || 1,
                stress: activeLog?.stress || 3,
                mood,
                sleepDetails: activeLog?.sleepDetails || '',
                additionalNotes: [previous, tagLine].filter(Boolean).join('\n'),
                behavior: activeLog?.behavior || '',
                aiAnalysis: activeLog?.aiAnalysis,
              }, { analyze: false });
              setAppTab('inicio');
            }}
          />
        )}
        
        {/* Active Health Profile Badges */}
        {(profile.isCeliac || profile.hasDiabetes || profile.hasObesity || profile.hasDepression) && (
          <div className={`${appTab === 'perfil' ? 'flex' : 'hidden'} bg-white rounded-[24px] p-4 border border-[#d7e6d4] flex-wrap items-center gap-2 text-xs shadow-2xs`}>
            <span className="font-bold text-[#7A7A70] uppercase tracking-wider text-[10px]">Perfil de Salud Activo:</span>
            {profile.isCeliac && (
              <span className="bg-rose-50 border border-rose-100 text-rose-700 px-2.5 py-1 rounded-full font-semibold flex items-center gap-1">🌾 Celíaca</span>
            )}
            {profile.hasDiabetes && (
              <span className="bg-blue-50 border border-blue-100 text-blue-700 px-2.5 py-1 rounded-full font-semibold flex items-center gap-1">🩸 Diabetes / Insulina</span>
            )}
            {profile.hasObesity && (
              <span className="bg-amber-50 border border-amber-100 text-amber-700 px-2.5 py-1 rounded-full font-semibold flex items-center gap-1">⚖️ Obesidad</span>
            )}
            {profile.hasDepression && (
              <span className="bg-indigo-50 border border-indigo-100 text-indigo-700 px-2.5 py-1 rounded-full font-semibold flex items-center gap-1">🧠 Depresión</span>
            )}
          </div>
        )}
        
        {/* Alert Banner Detection */}
        {checkAlerts() && (
          <div className="hidden bg-amber-50 border border-amber-200 p-4 rounded-2xl gap-3 text-amber-900 text-sm leading-relaxed">
            <span>💡</span>
            <div>
              <strong>Aviso de Bienestar:</strong> He observado que durante varios días consecutivos has registrado indicadores de bienestar elevados (fatiga, dolor, estrés o descanso pobre). Si estos síntomas persisten o afectan tu calidad de vida, considera consultar con un profesional de la salud.
            </div>
          </div>
        )}

        {/* Column 1: Current Phase Details */}
        <div className="hidden flex-col gap-4">
          <div className="bg-white rounded-[32px] p-6 md:p-8 shadow-sm border border-[#EFEFEF] flex flex-col flex-1 min-h-[480px]">
            <div className={`inline-block px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider mb-4 w-fit ${phaseDetails.colorClass}`}>
              {phaseDetails.badge}
            </div>
            
            <h2 className="text-3xl md:text-4xl font-serif font-medium text-[#3A3A35] mb-2">
              Día {selectedCycleDay} del Ciclo
            </h2>
            <p className="text-sm text-[#7A7A70] leading-relaxed mb-6">
              {phaseDetails.description}
            </p>

            {/* Microhormonal details */}
            <div className="bg-[#F5F6F8] p-4 rounded-2xl border border-[#d7e6d4] mb-6">
              <p className="text-[10px] font-bold text-[#9A9A90] uppercase tracking-widest mb-1">Estado Hormonal</p>
              <p className="text-xs font-medium text-[#1E5631]">{phaseDetails.hormones}</p>
            </div>

            {/* Cognitive & Physical Stats Progress Bars */}
            <div className="space-y-5">
              <h4 className="text-[10px] font-bold text-[#9A9A90] uppercase tracking-widest">Indicadores de Fase</h4>
              <div>
                <div className="flex justify-between text-[11px] font-bold uppercase tracking-widest text-[#9A9A90] mb-1.5">
                  <span>Concentración</span>
                  <span className="text-[#1E5631]">{phaseDetails.stats.concentration}%</span>
                </div>
                <div className="h-1.5 w-full bg-[#EFEFEF] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#1E5631] rounded-full transition-all duration-500"
                    style={{ width: `${phaseDetails.stats.concentration}%` }}
                  ></div>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[11px] font-bold uppercase tracking-widest text-[#9A9A90] mb-1.5">
                  <span>Creatividad</span>
                  <span className="text-[#1E5631]">{phaseDetails.stats.creativity}%</span>
                </div>
                <div className="h-1.5 w-full bg-[#EFEFEF] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#1E5631] rounded-full transition-all duration-500"
                    style={{ width: `${phaseDetails.stats.creativity}%` }}
                  ></div>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[11px] font-bold uppercase tracking-widest text-[#9A9A90] mb-1.5">
                  <span>Energía Física</span>
                  <span className="text-[#1E5631]">{phaseDetails.stats.physicalEnergy}%</span>
                </div>
                <div className="h-1.5 w-full bg-[#EFEFEF] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#1E5631] rounded-full transition-all duration-500"
                    style={{ width: `${phaseDetails.stats.physicalEnergy}%` }}
                  ></div>
                </div>
              </div>
            </div>

            {/* Autocuidado Tips */}
            <div className="mt-8 pt-6 border-t border-[#EFEFEF] space-y-3">
              <h5 className="text-[10px] font-bold text-[#9A9A90] uppercase tracking-widest">Consejos de autocuidado</h5>
              <ul className="space-y-1.5">
                {phaseDetails.tips.slice(0, 2).map((tip, idx) => (
                  <li key={idx} className="text-xs text-[#1E5631] flex items-start gap-1.5">
                    <span className="text-rose-400">✨</span>
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Force start of period & Re-register cycle buttons */}
            <div className="mt-auto pt-6 flex flex-col gap-2.5">
              <button
                onClick={() => handleUpdatePeriodStart(selectedDateStr)}
                className="w-full bg-[#F5F6F8] hover:bg-[#EFEFEF] border border-[#d7e6d4] text-[11px] font-bold uppercase tracking-wider py-3 rounded-full text-rose-500 hover:text-rose-600 transition-all cursor-pointer text-center"
              >
                🔴 Registrar Inicio de Periodo Hoy
              </button>
              <button
                onClick={handleReRegister}
                className="w-full bg-white hover:bg-rose-50/50 border border-dashed border-rose-300 text-[11px] font-bold uppercase tracking-wider py-3 rounded-full text-rose-600 hover:text-rose-700 transition-all cursor-pointer text-center"
              >
                🔄 Volver a Empezar (Check-In Diario)
              </button>
            </div>

          </div>
        </div>

        {/* Column 2: Calendar & Main Dashboard Cards */}
        <div className="flex flex-col gap-4">
          
          {/* Interactive Calendar widget */}
          <div className={appTab === 'calendario' && !cycleSheet ? 'flex flex-col gap-3' : 'hidden'}>
            <header className="px-1 pt-6">
              <span className="font-serif text-[15px] tracking-[0.18em] text-[#3A44C4]">CYCLIA</span>
              <h1 className="m-0 text-[28px] font-extrabold">Tu ciclo</h1>
            </header>
            <CalendarView
              profile={profile}
              selectedDateStr={selectedDateStr}
              onSelectDate={setSelectedDateStr}
            />
            <section className="flex flex-col gap-1.5 rounded-[20px] bg-white p-4">
              <span className="text-xs font-extrabold tracking-wide text-[#4A4F7A]">DÍA SELECCIONADO</span>
              <h2 className="m-0 text-[17px] font-extrabold">{formatFriendlyDate(selectedDateStr)}</h2>
              <p className="m-0 text-sm text-[#3B4070]">Día {selectedCycleDay} del ciclo · {phaseDetails.name} · {activeLog ? 'Con registro' : 'Sin registro'}</p>
              <button type="button" onClick={() => setCycleSheet('dia')} className="w-fit cursor-pointer py-2 text-[15px] font-extrabold text-[#3A44C4]">Ver detalle del día</button>
              <div className="my-1 h-px bg-[#E1E5F5]" />
              <p className="m-0 text-sm"><strong>Próximo periodo estimado:</strong> {formatFriendlyDate(formatDateStr(new Date(new Date().setHours(12, 0, 0, 0) + (profile.cycleLength - getCycleDay(formatDateStr(new Date()), profile.lastPeriodDate, profile.cycleLength) + 1) * 86400000)))}</p>
            </section>
            <button type="button" onClick={() => setCycleSheet('evolucion')} className="flex items-center gap-3 rounded-[20px] bg-[#F6E27F] p-4 text-left text-[#1B1F5E]">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-lg">↗</span>
              <span><strong className="block text-base">Evolución de bienestar</strong><span className="text-[13px] text-[#3B4070]">Ánimo, estrés, dolor, sueño y cansancio</span></span>
            </button>
            <button type="button" onClick={() => handleUpdatePeriodStart(formatDateStr(new Date()))} className="h-[50px] cursor-pointer rounded-full bg-[#F49A9E] text-[15px] font-extrabold text-[#1B1F5E]">Registrar inicio de periodo hoy</button>
          </div>
          {appTab === 'calendario' && cycleSheet === 'dia' && (
            <section className="flex flex-col gap-3 pt-4">
              <button type="button" onClick={() => setCycleSheet(null)} className="w-fit cursor-pointer text-[15px] font-extrabold text-[#3A44C4]">← Calendario</button>
              <h1 className="m-0 text-[26px] font-extrabold">{formatFriendlyDate(selectedDateStr)}</h1>
              <div className="flex flex-wrap gap-2">
                <span className="rounded-2xl px-3 py-1 text-[13px] font-extrabold text-[#1B1F5E]" style={{ background: phaseDetails.bgHex, color: phaseDetails.textHex }}>{phaseDetails.name}</span>
                <span className="rounded-2xl border border-[#C9D3EF] bg-white px-3 py-1 text-[13px] font-bold">Día {selectedCycleDay} del ciclo</span>
              </div>
              {activeLog ? (
                <>
                  <section className="rounded-[20px] bg-white p-4">
                    <h2 className="m-0 text-base font-extrabold">Cómo te sentiste</h2>
                    <div className="mt-3 grid grid-cols-2 gap-2.5">
                      {[
                        ['Cansancio', activeLog.fatigue],
                        ['Ánimo', activeLog.mood],
                        ['Estrés', activeLog.stress],
                        ['Sueño', activeLog.sleepQuality],
                        ['Dolor', activeLog.pain],
                      ].map(([label, value]) => (
                        <div key={String(label)} className="flex flex-col gap-1.5 rounded-[14px] bg-[#F3F5FC] p-3">
                          <span className="text-[13px] font-bold text-[#4A4F7A]">{label}</span>
                          <span className="text-xl font-extrabold">{value} / 5</span>
                          <div className="h-1.5 rounded-full bg-[#E1E5F5]"><div className="h-1.5 rounded-full bg-[#3A44C4]" style={{ width: `${Number(value) * 20}%` }} /></div>
                        </div>
                      ))}
                    </div>
                  </section>
                  <section className="rounded-[20px] bg-white p-4 text-sm leading-relaxed text-[#3B4070]">
                    <h2 className="m-0 mb-2 text-base font-extrabold text-[#1B1F5E]">Sueño y hábitos</h2>
                    <p className="m-0"><strong className="text-[#1B1F5E]">Sueño:</strong> {activeLog.sleepDetails || 'Sin detalle'}</p>
                    <p className="m-0 mt-2"><strong className="text-[#1B1F5E]">Hábitos:</strong> {activeLog.behavior || 'Sin detalle'}</p>
                    <p className="m-0 mt-2"><strong className="text-[#1B1F5E]">Notas:</strong> {activeLog.additionalNotes || 'Sin notas'}</p>
                  </section>
                </>
              ) : (
                <p className="rounded-[20px] bg-white p-4 text-sm">Este día todavía no tiene registro.</p>
              )}
              <div className="flex gap-2.5">
                <button type="button" onClick={() => activeLog ? setIsAnalysisOpen(true) : setAppTab('registro')} className="h-[50px] flex-1 cursor-pointer rounded-full bg-[#F49A9E] text-[15px] font-extrabold text-[#1B1F5E]">Ver análisis</button>
                <button type="button" onClick={() => setAppTab('registro')} className="h-[50px] flex-1 cursor-pointer rounded-full bg-[#F6E27F] text-[15px] font-extrabold text-[#1B1F5E]">Editar registro</button>
              </div>
            </section>
          )}
          {appTab === 'calendario' && cycleSheet === 'evolucion' && (
            <div className="flex flex-col gap-3 pt-4">
              <button type="button" onClick={() => setCycleSheet(null)} className="w-fit cursor-pointer text-[15px] font-extrabold text-[#3A44C4]">← Calendario</button>
              <h1 className="m-0 text-[26px] font-extrabold">Evolución de bienestar</h1>
            </div>
          )}

          {/* Detailed Recommended Activity for Selected Day */}
          <div className="hidden bg-white rounded-[32px] p-6 shadow-sm border border-[#EFEFEF] flex-col gap-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#EFEFEF]">
              <div className="flex items-center gap-2.5">
                <span className="text-2xl">🏃‍♀️</span>
                <div>
                  <h3 className="font-serif font-semibold text-lg text-[#1E5631]">Actividad Recomendada</h3>
                  <p className="text-[10px] uppercase tracking-widest text-[#9A9A90] font-bold">Personalizado para ti</p>
                </div>
              </div>
              <span className="inline-block px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-rose-50 border border-rose-100 text-rose-700">
                Fase: {selectedActivity.phaseName}
              </span>
            </div>

            <div>
              <h4 className="text-base font-serif font-bold text-[#3A3A35] mb-2 leading-tight">
                {selectedActivity.title}
              </h4>
              <p className="text-sm text-[#1E5631] leading-relaxed mb-4">
                {selectedActivity.description}
              </p>
            </div>

            <div className="bg-[#F5F6F8] p-4 rounded-2xl border border-[#d7e6d4]">
              <h5 className="text-[10px] font-bold text-[#9A9A90] uppercase tracking-widest mb-1.5 flex items-center gap-1">
                <span>💡</span> ¿Por qué es adecuada para ti?
              </h5>
              <p className="text-xs text-[#1E5631] leading-relaxed">
                {selectedActivity.why}
              </p>
            </div>

            {selectedActivity.illnessNotes.length > 0 && (
              <div className="mt-2 space-y-2">
                <h5 className="text-[10px] font-bold text-[#9A9A90] uppercase tracking-widest flex items-center gap-1 text-amber-700">
                  <span>⚠️</span> Adaptaciones para tus condiciones de salud:
                </h5>
                <div className="grid grid-cols-1 gap-2">
                  {selectedActivity.illnessNotes.map((note, idx) => (
                    <div key={idx} className="p-3 bg-amber-50/40 border border-amber-100 rounded-xl text-xs text-[#78350F] leading-relaxed">
                      {note}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Footer Grid cards: Productivity Suggestions & Wellness Log Panel */}
          <div className={`grid grid-cols-1 gap-4 ${appTab === 'registro' ? '' : 'hidden'}`}>
            
            {/* Productivity Suggested */}
            <div className="hidden bg-[#1E5631] rounded-[32px] p-6 text-white flex-col justify-between shadow-xs">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-widest opacity-80 mb-4 flex items-center gap-1.5">
                  💼 Productividad Sugerida
                </h4>
                <ul className="space-y-3">
                  {phaseDetails.productivity.map((task, idx) => (
                    <li key={idx} className="text-xs font-medium flex items-start gap-2 leading-relaxed">
                      <span className="opacity-70">•</span>
                      <span>{task}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="mt-6 pt-4 border-t border-white/10">
                <p className="text-[11px] italic opacity-85 leading-relaxed">
                  "Tu foco hoy se orienta al {phaseDetails.name.toLowerCase()}."
                </p>
              </div>
            </div>

            {/* Wellness Checkin summary panel */}
            <div className="hidden bg-[#EFEFEF] rounded-[32px] p-6 flex-col justify-between shadow-xs border border-[#d7e6d4]">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-widest text-[#9A9A90] mb-4 flex items-center gap-1.5">
                  ❤️ Registro de Bienestar
                </h4>
                
                {activeLog ? (
                  <div className="space-y-3.5">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-semibold text-[#1E5631]">Sueño:</span>
                      <span className="text-xs font-bold text-[#3A3A35] bg-white px-2.5 py-1 rounded-full border border-[#d7e6d4]">
                        {SCALE_LABELS.sleep[activeLog.sleepQuality - 1]}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-semibold text-[#1E5631]">Estrés:</span>
                      <span className="text-xs font-bold text-[#3A3A35] bg-white px-2.5 py-1 rounded-full border border-[#d7e6d4]">
                        {SCALE_LABELS.stress[activeLog.stress - 1]}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-semibold text-[#1E5631]">Energía:</span>
                      <span className="text-xs font-bold text-[#3A3A35] bg-white px-2.5 py-1 rounded-full border border-[#d7e6d4]">
                        {SCALE_LABELS.fatigue === undefined ? 'N/A' : (SCALE_LABELS.fatigue[activeLog.fatigue - 1] === 'Ninguna' ? 'Alta' : 'Moderada')}
                      </span>
                    </div>

                    {/* Text logs details including the new behavior log */}
                    {(activeLog.sleepDetails || activeLog.additionalNotes || activeLog.behavior) && (
                      <div className="mt-4 pt-3 border-t border-[#d7e6d4]/60 space-y-2">
                        {activeLog.sleepDetails && (
                          <div className="text-xs bg-white/50 p-2.5 rounded-xl border border-[#d7e6d4] leading-relaxed">
                            <span className="font-bold text-[#1E5631]">🌙 Noche:</span> <span className="text-[#3A3A35]">{activeLog.sleepDetails}</span>
                          </div>
                        )}
                        {activeLog.additionalNotes && (
                          <div className="text-xs bg-white/50 p-2.5 rounded-xl border border-[#d7e6d4] leading-relaxed">
                            <span className="font-bold text-[#1E5631]">📝 Notas:</span> <span className="text-[#3A3A35]">{activeLog.additionalNotes}</span>
                          </div>
                        )}
                        {activeLog.behavior && (
                          <div className="text-xs bg-emerald-50/50 p-2.5 rounded-xl border border-emerald-100/50 leading-relaxed">
                            <span className="font-bold text-emerald-800">🏃‍♀️ Hábitos y Rutinas:</span> <span className="text-[#3A3A35]">{activeLog.behavior}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-6">
                    <p className="text-xs text-[#9A9A90] font-medium leading-relaxed mb-1">No has completado tu registro diario hoy.</p>
                    <p className="text-[10px] text-[#1E5631] italic">Tu asistente espera tus datos para dar consejos inteligentes.</p>
                  </div>
                )}
              </div>

              <div className="mt-6 space-y-2">
                <button
                  onClick={() => setIsCheckinOpen(true)}
                  className="w-full bg-white hover:bg-white/80 text-[#1E5631] text-xs font-bold py-3 rounded-full border border-[#d7e6d4] shadow-2xs transition-colors cursor-pointer text-center"
                >
                  {activeLog ? '📝 Editar Registro Diario' : '➕ Registrar Bienestar Hoy'}
                </button>
                
                {activeLog && (
                  <button
                    onClick={handleRequestAnalysisManually}
                    disabled={isAnalyzing}
                    className="w-full bg-[#1E5631] hover:bg-[#1B4D3E] text-white text-xs font-bold py-3 rounded-full shadow-2xs transition-all cursor-pointer text-center"
                  >
                    {isAnalyzing ? '✨ Generando análisis...' : '🔍 Ver Análisis Inteligente'}
                  </button>
                )}
              </div>
            </div>

          </div>
        </div>

        {/* Column 3: Collapsible Chat Panel Sidebar */}
        {appTab === 'chat' && chatHistoryOpen && (
          <div className="flex flex-col gap-3 pt-2">
            <button type="button" onClick={() => setChatHistoryOpen(false)} className="w-fit cursor-pointer text-[15px] font-extrabold text-[#3A44C4]">← Cyclia IA</button>
            <h1 className="m-0 text-[26px] font-extrabold">Tus conversaciones</h1>
            <button type="button" onClick={() => setChatHistoryOpen(false)} className="flex h-[50px] cursor-pointer items-center justify-center rounded-full bg-[#F49A9E] text-[15px] font-extrabold text-[#1B1F5E]">Nueva conversación</button>
            {chatHistory.length === 0 && <p className="rounded-[18px] bg-white p-4 text-sm">Todavía no hay conversaciones.</p>}
            {chatHistory.filter((message) => message.role === 'user').map((message) => (
              <button key={message.id} type="button" onClick={() => setChatHistoryOpen(false)} className="flex flex-col gap-1 rounded-[18px] bg-white p-4 text-left">
                <strong className="text-[15px]">{message.content.slice(0, 48)}</strong>
                <span className="text-[13px] text-[#3B4070]">{message.timestamp}</span>
              </button>
            ))}
            {chatHistory.length > 0 && (
              <button type="button" onClick={handleClearHistory} className="mx-auto mt-1 h-11 cursor-pointer rounded-full bg-[#F6E27F] px-5 text-sm font-extrabold text-[#1B1F5E]">Borrar historial</button>
            )}
          </div>
        )}
        {appTab === 'chat' && !chatHistoryOpen && (
          <div className="min-h-[70vh]">
            <ChatPanel
              profile={{
                ...profile,
                currentPhase: selectedPhase,
                cycleDay: selectedCycleDay
              }}
              logs={Object.values(logs)}
              chatHistory={chatHistory}
              onAddMessage={handleAddMessage}
              onClearHistory={handleClearHistory}
              onOpenHistory={() => setChatHistoryOpen(true)}
              previousInteractionId={previousInteractionId}
              environmentId={environmentId}
              onUpdateAgentState={updateAgentState}
            />
          </div>
        )}

        {/* Full Width Symptom and Habit Evolution Graph */}
        <div className={appTab === 'calendario' && cycleSheet === 'evolucion' ? 'mt-1' : 'hidden'}>
          <SymptomChart
            logs={logs}
            profile={profile}
            onLoadDemoData={handleLoadDemoData}
          />
        </div>

        {appTab === 'perfil' && profileSheet === 'ciclo' && (
          <CycleDataScreen
            profile={profile}
            goals={savedGoals}
            onBack={() => setProfileSheet(null)}
            onGoals={() => setProfileSheet('objetivos')}
            onSave={(next) => { void handleSaveProfile(next); setProfileSheet(null); }}
          />
        )}
        {appTab === 'perfil' && profileSheet === 'objetivos' && (
          <GoalsScreen
            saved={savedGoals}
            onBack={() => setProfileSheet(null)}
            onSave={(ids) => {
              localStorage.setItem('cyclia_objectives', JSON.stringify(ids));
              localStorage.setItem('cyclia_objectives_done', '1');
              setSavedGoals(ids);
              setObjectivesDone(true);
              setProfileSheet(null);
            }}
          />
        )}
        {appTab === 'perfil' && profileSheet === 'privacidad' && (
          <PrivacyScreen
            darkMode={darkMode}
            onBack={() => setProfileSheet(null)}
            onToggleDark={() => setDarkMode((value) => !value)}
            onExport={() => {
              const blob = new Blob([JSON.stringify({ profile, logs }, null, 2)], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const link = document.createElement('a');
              link.href = url;
              link.download = 'cyclia-datos.json';
              link.click();
              URL.revokeObjectURL(url);
            }}
            onDelete={() => { if (confirm('¿Eliminar los datos de esta cuenta en este dispositivo?')) handleResetAppData(); }}
          />
        )}
        {appTab === 'perfil' && !profileSheet && (
          <div className="flex flex-col">
            <header className="-mx-4 flex flex-col items-center gap-2 bg-[#3A44C4] px-5 pb-7 pt-12 text-center text-white">
              <span className="flex h-[84px] w-[84px] items-center justify-center rounded-full border-[3px] border-white bg-[#F9C4C6] font-serif text-4xl text-[#3A44C4]">{profile.name.slice(0, 1).toUpperCase()}</span>
              <h1 className="m-0 text-2xl font-extrabold">{profile.name}</h1>
              <span className="text-sm text-[#DCE5FA]">Ciclo de {profile.cycleLength} días · Periodo de {profile.periodLength} días</span>
            </header>
            <nav className="flex flex-col gap-2.5 py-4">
              {[
                ['Datos del ciclo y salud', 'Fechas, duración, condiciones', () => setProfileSheet('ciclo')],
                ['Privacidad y notificaciones', darkMode ? 'Modo oscuro activo' : 'Recordatorios, tus datos', () => setProfileSheet('privacidad')],
                ['Objetivos', 'Elige tu foco', () => setProfileSheet('objetivos')],
                ['Ayuda y soporte', 'Preguntas frecuentes, contacto', () => setAppTab('chat')],
              ].map(([title, subtitle, action]) => (
                <button key={String(title)} type="button" onClick={action as () => void} className="flex cursor-pointer items-center gap-3 rounded-[18px] bg-white px-4 py-3.5 text-left">
                  <span className="flex-1">
                    <strong className="block text-[15px]">{title}</strong>
                    <span className="text-[13px] text-[#4A4F7A]">{subtitle}</span>
                  </span>
                  <span className="text-[#3A44C4]">›</span>
                </button>
              ))}
              <button type="button" onClick={handleResetAppData} className="cursor-pointer rounded-[18px] bg-white px-4 py-3.5 text-left text-sm font-extrabold text-[#3A44C4]">Restaurar datos de esta cuenta</button>
              <button
                type="button"
                onClick={async () => {
                  if (confirm('¿Estás segura de que deseas cerrar sesión?')) await signOut();
                }}
                className="mx-auto mt-2 flex h-12 cursor-pointer items-center rounded-full bg-[#F49A9E] px-7 text-[15px] font-extrabold text-[#1B1F5E]"
              >
                Cerrar sesión
              </button>
            </nav>
          </div>
        )}
        </>)}

      </main>

      <nav className="fixed bottom-0 left-1/2 z-40 grid h-[82px] w-full max-w-[480px] -translate-x-1/2 grid-cols-5 border-t border-[#E7ECFB] bg-white">
        {([
          ['inicio', 'Inicio', '⌂'],
          ['calendario', 'Ciclo', '▦'],
          ['registro', 'Registro', '+'],
          ['chat', 'Cyclia IA', '✦'],
          ['perfil', 'Perfil', '•'],
        ] as const).map(([id, label, icon]) => (
          <button
            key={id}
            type="button"
            onClick={() => { setHomeSheet(null); setCycleSheet(null); setProfileSheet(null); setChatHistoryOpen(false); setAppTab(id); }}
            className={`flex cursor-pointer flex-col items-center justify-center gap-1 text-[11px] font-extrabold ${appTab === id ? 'text-[#3A44C4]' : 'text-[#8B90B8]'}`}
          >
            <span className="text-lg leading-none">{icon}</span>
            {label}
          </button>
        ))}
      </nav>

      {/* Daily Check-in Modal */}
      {isCheckinOpen && (
        <DailyCheckin
          dateStr={selectedDateStr}
          existingLog={activeLog}
          onSave={handleSaveLog}
          onClose={() => setIsCheckinOpen(false)}
        />
      )}

      {/* AI Analysis View Modal */}
      {isAnalysisOpen && (
        <div className="fixed inset-0 z-50 flex justify-center bg-[#E3F1FB]">
          <div className="flex w-full max-w-[390px] flex-col max-h-[100dvh] overflow-y-auto bg-[#E3F1FB] pb-8">
            <div className="bg-[#3A44C4] px-5 pb-6 pt-10 text-white">
              <div>
                <button type="button" onClick={() => setIsAnalysisOpen(false)} className="cursor-pointer text-[15px] font-extrabold">← Registro</button>
                <p className="mt-2 text-xs font-extrabold tracking-widest text-[#F9C4C6]">ANÁLISIS DE CYCLIA</p>
                <h3 className="m-0 text-[26px] font-extrabold">{formatFriendlyDate(selectedDateStr)}</h3>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto pr-1 mb-6">
              {isAnalyzing ? (
                <div className="text-center py-12 space-y-4">
                  <div className="w-10 h-10 border-4 border-t-[#1E5631] border-[#d7e6d4] rounded-full animate-spin mx-auto"></div>
                  <p className="text-sm font-semibold text-[#1E5631] animate-pulse">Cyclia está analizando tu registro hormonal e historial diario...</p>
                </div>
              ) : analysisError ? (
                <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-sm">
                  ⚠️ {analysisError}
                  <button
                    onClick={handleRequestAnalysisManually}
                    className="block mt-4 text-xs font-bold underline cursor-pointer"
                  >
                    Reintentar análisis
                  </button>
                </div>
              ) : activeLog?.aiAnalysis ? (
                <div className="space-y-4 text-sm text-[#3A3A35] leading-relaxed">
                  <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl mb-4">
                    <p className="text-xs font-bold uppercase text-emerald-800 mb-1">💡 Conclusión Biológica</p>
                    <p className="text-xs text-emerald-950 font-medium leading-normal">
                      Este análisis ha sido personalizado según tu fase menstrual ({selectedPhase}) y el registro de tu estado de ánimo, dolores y calidad de sueño.
                    </p>
                  </div>
                  
                  {/* Parsing sections from response */}
                  <div className="whitespace-pre-wrap leading-relaxed bg-[#F5F6F8] p-5 rounded-2xl border border-[#d7e6d4] max-h-[400px] overflow-y-auto">
                    {activeLog.aiAnalysis}
                  </div>
                </div>
              ) : (
                <div className="text-center py-12">
                  <p className="text-sm text-[#7A7A70]">No hay análisis disponible aún. Haz clic en el botón de abajo para generarlo por IA.</p>
                  <button
                    onClick={handleRequestAnalysisManually}
                    className="mt-4 bg-[#1E5631] hover:bg-[#1B4D3E] text-white font-semibold py-2.5 px-6 rounded-full text-xs uppercase tracking-wide cursor-pointer"
                  >
                    Generar Análisis por IA
                  </button>
                </div>
              )}
            </div>

            <div className="border-t border-[#d7e6d4] pt-4 flex justify-end">
              <button
                onClick={() => setIsAnalysisOpen(false)}
                className="bg-[#1E5631] hover:bg-[#1B4D3E] text-white font-semibold py-2.5 px-6 rounded-full text-xs uppercase tracking-wide cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Health Profile Modal */}
      {isEditingHealth && (
        <HealthProfileModal
          profile={profile}
          onSave={handleSaveProfile}
          onClose={() => setIsEditingHealth(false)}
        />
      )}

    </div>
    </div>
  );
}
