import React, { useState, useEffect, useRef } from 'react';
import { UserProfile, DailyLog, ChatMessage, MenstrualPhase } from './types';
import Onboarding from './components/Onboarding';
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
  const [appTab, setAppTab] = useState<'inicio' | 'calendario' | 'registro' | 'chat' | 'perfil'>('inicio');
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
  const [activeLoginTab, setActiveLoginTab] = useState<'guest' | 'email'>('guest');
  const [gmailError, setGmailError] = useState('');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [isSignUpMode, setIsSignUpMode] = useState(false);
  const [authPanelError, setAuthPanelError] = useState('');
  const [isAuthProcessing, setIsAuthProcessing] = useState(false);

  const guestMigrationStarted = useRef(false);
  const chatMigrationStarted = useRef(false);

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
      const oauthError = new URLSearchParams(window.location.search).get('error_description');
      if (oauthError) setAuthPanelError(oauthError.replace(/\+/g, ' '));
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
  const handleSaveLog = async (log: DailyLog) => {
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
    
    // Show a quick toast notification
    setNotificationMsg("¡Registro guardado! Generando nuevo análisis...");
    setShowNotification(true);
    setTimeout(() => setShowNotification(false), 4000);

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

  if (isLoadingAuth) {
    return (
      <div className="min-h-screen bg-[#FAF8F5] flex flex-col items-center justify-center p-6 text-center animate-pulse">
        <span className="text-4xl">🌸</span>
        <h2 className="text-xl font-serif font-semibold text-[#5A5A40] mt-4">Iniciando Cyclia...</h2>
        <p className="text-xs text-[#9A9A90] mt-1">Conectando de forma segura con Supabase</p>
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
      <div className="min-h-screen bg-[#E7E2D8] flex justify-center">
      <div className="w-full max-w-[430px] min-h-screen bg-[#FAF8F5] flex flex-col px-5 py-8 shadow-2xl">
        <p className="text-[10px] uppercase tracking-[0.22em] text-[#9A9A90] font-bold">Canal digital</p>
        <div className="bg-white rounded-[32px] p-8 shadow-sm border border-[#F0EDE8] w-full flex flex-col items-center gap-6 animate-fade-in mt-6">
          <div className="w-16 h-16 bg-[#5A5A40] rounded-full flex items-center justify-center text-3xl shadow-xs">
            🌸
          </div>
          <div>
            <h1 className="text-3xl font-serif font-semibold tracking-tight text-[#5A5A40]">Cyclia</h1>
            <p className="text-xs uppercase tracking-widest text-[#9A9A90] font-bold mt-1">Bienestar Femenino Inteligente</p>
          </div>
          <p className="text-xs text-[#7A7A70] leading-relaxed max-w-sm">
            Bienvenida a Cyclia. Elige un método para acceder a tu diario de bienestar, calendario y análisis personalizados en la nube.
          </p>
          {!isSupabaseConfigured && (
            <div className="w-full bg-amber-50 text-amber-800 p-3.5 rounded-2xl text-[11px] font-medium leading-relaxed border border-amber-100 text-left">
              Faltan VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en el archivo .env. Sin esas claves Cyclia no puede entrar a Supabase.
            </div>
          )}

          <button
            type="button"
            disabled={isAuthProcessing || !isSupabaseConfigured}
            onClick={handleGoogleAuth}
            className="w-full bg-white hover:bg-[#FAF8F5] disabled:opacity-50 text-[#3A3A35] font-semibold py-3.5 px-6 rounded-full text-xs border border-[#E4DFD6] transition-all cursor-pointer flex items-center justify-center gap-2.5 shadow-xs"
          >
            {isAuthProcessing ? (
              <div className="w-4 h-4 border-2 border-[#5A5A40] border-t-transparent rounded-full animate-spin" />
            ) : 'Entrar con Gmail'}
          </button>
          <p className="text-[10px] uppercase tracking-widest text-[#9A9A90] font-bold">o</p>

          {/* Tab Selection */}
          <div className="w-full flex bg-[#FAF8F5] rounded-full p-1 border border-[#F0EDE8]">
            <button
              type="button"
              onClick={() => { setActiveLoginTab('guest'); setAuthPanelError(''); }}
              className={`flex-1 py-2 text-xs font-semibold rounded-full transition-all cursor-pointer ${activeLoginTab === 'guest' ? 'bg-[#5A5A40] text-white shadow-xs' : 'text-[#7A7A70] hover:text-[#5A5A40]'}`}
            >
              Invitado / Demo
            </button>
            <button
              type="button"
              onClick={() => { setActiveLoginTab('email'); setAuthPanelError(''); }}
              className={`flex-1 py-2 text-xs font-semibold rounded-full transition-all cursor-pointer ${activeLoginTab === 'email' ? 'bg-[#5A5A40] text-white shadow-xs' : 'text-[#7A7A70] hover:text-[#5A5A40]'}`}
            >
              Correo
            </button>
          </div>

          {/* Error Message */}
          {authPanelError && (
            <div className="w-full bg-red-50 text-red-600 p-3.5 rounded-2xl text-[11px] font-medium leading-relaxed border border-red-100 text-left">
              ⚠️ {authPanelError}
            </div>
          )}

          {/* Active Tab View */}
          <div className="w-full">
            {activeLoginTab === 'guest' && (
              <div className="flex flex-col gap-4 animate-fade-in">
                <p className="text-xs text-[#7A7A70] leading-relaxed text-left">
                  Entras sin registrarte. Cyclia abre una sesión anónima y guarda tu perfil, registros y chat en Supabase.
                </p>
                <button
                  type="button"
                  disabled={isAuthProcessing || !isSupabaseConfigured}
                  onClick={handleGuestAuth}
                  className="w-full bg-[#5A5A40] hover:bg-[#484833] disabled:opacity-50 text-white font-semibold py-3.5 px-6 rounded-full text-xs uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-2.5 shadow-xs"
                >
                  {isAuthProcessing ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : "Entrar sin cuenta"}
                </button>
              </div>
            )}

            {activeLoginTab === 'email' && (
              <form onSubmit={handleEmailAuth} className="flex flex-col gap-3 text-left animate-fade-in">
                <div>
                  <label className="block text-[10px] font-semibold text-[#7A7A70] uppercase tracking-wider mb-1">Correo Electrónico</label>
                  <input
                    type="email"
                    required
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    placeholder="ejemplo@correo.com"
                    className="w-full bg-[#FAF8F5] border border-[#EDE8E0] rounded-xl px-4 py-2.5 text-xs text-[#3A3A35] focus:outline-none focus:ring-1 focus:ring-[#5A5A40] focus:border-[#5A5A40]"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-semibold text-[#7A7A70] uppercase tracking-wider mb-1">Contraseña</label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="••••••"
                    className="w-full bg-[#FAF8F5] border border-[#EDE8E0] rounded-xl px-4 py-2.5 text-xs text-[#3A3A35] focus:outline-none focus:ring-1 focus:ring-[#5A5A40] focus:border-[#5A5A40]"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isAuthProcessing || !isSupabaseConfigured}
                  className="w-full mt-2 bg-[#5A5A40] hover:bg-[#484833] disabled:opacity-50 text-white font-semibold py-3.5 px-6 rounded-full text-xs uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-2.5 shadow-xs"
                >
                  {isAuthProcessing ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : isSignUpMode ? "Crear Cuenta" : "Iniciar Sesión"}
                </button>

                <div className="text-center mt-2">
                  <button
                    type="button"
                    onClick={() => { setIsSignUpMode(!isSignUpMode); setAuthPanelError(''); }}
                    className="text-xs text-[#5A5A40] hover:underline font-semibold cursor-pointer"
                  >
                    {isSignUpMode ? "¿Ya tienes cuenta? Inicia sesión" : "¿No tienes cuenta? Regístrate aquí"}
                  </button>
                </div>
              </form>
            )}
          </div>

          <div className="text-[10px] text-[#9A9A90] font-medium leading-relaxed max-w-[280px]">
            Conectado de manera segura con Supabase Authentication y Postgres
          </div>
        </div>
      </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-[#E7E2D8] flex justify-center">
        <div className="w-full max-w-[430px] min-h-screen bg-[#FAF8F5] px-4 py-8 shadow-2xl flex flex-col gap-4">
          {!user.hasGoogle && (
            <div className="bg-white rounded-[24px] p-4 border border-[#E4DFD6] flex flex-col sm:flex-row sm:items-center gap-3">
              <p className="text-xs text-[#5A5A40] text-left flex-1">Conecta Gmail para entrar con tu cuenta. Google te pedirá elegir el correo.</p>
              <button type="button" onClick={handleConnectGoogle} className="bg-[#5A5A40] text-white text-xs font-semibold px-5 py-3 rounded-full cursor-pointer">Conectar Gmail</button>
            </div>
          )}
          {gmailError && <p className="text-xs text-red-600 text-left">{gmailError}</p>}
          <Onboarding onComplete={handleSaveProfile} accountEmail={user.email} />
        </div>
      </div>
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
    <div className="min-h-screen bg-[#E7E2D8] text-[#3A3A35] font-sans flex justify-center">
    <div className="w-full max-w-[430px] min-h-screen bg-[#FAF8F5] relative flex flex-col shadow-2xl pb-24">
      
      {/* Toast Notification */}
      {showNotification && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 bg-[#5A5A40] text-white py-3 px-6 rounded-full shadow-lg border border-white/15 text-xs font-semibold tracking-wider uppercase z-50 flex items-center gap-2 animate-fade-in">
          🌸 {notificationMsg}
        </div>
      )}

      <header id="header-nav" className="sticky top-0 z-30 bg-[#5A5A40] text-white px-5 pt-6 pb-5">
        <p className="text-[10px] uppercase tracking-[0.22em] text-white/70 font-bold">Canal digital</p>
        <div className="mt-2 flex items-center justify-between gap-3">
          <div>
            <h1 className="font-serif text-[1.7rem] leading-none">Hola, {profile.name}</h1>
            <p className="text-xs text-white/80 mt-1">{formatFriendlyDate(selectedDateStr)}</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-white/15 flex items-center justify-center text-2xl">🌸</div>
        </div>
      </header>

      {!user.hasGoogle && (
        <div className="bg-white text-[#5A5A40] px-4 py-3 flex items-center gap-3 border-b border-[#EDE8E0]">
          <p className="text-xs flex-1">Esta sesión no tiene Gmail. Conéctalo para que Google te pida tu cuenta.</p>
          <button type="button" onClick={handleConnectGoogle} className="bg-white text-[#5A5A40] text-xs font-semibold px-4 py-2 rounded-full cursor-pointer">Conectar Gmail</button>
        </div>
      )}
      {gmailError && <p className="bg-red-50 text-red-600 text-xs px-6 md:px-10 py-2">{gmailError}</p>}

      {/* Main Content Area */}
      <main className="flex-1 w-full px-4 py-4 flex flex-col gap-4">
        
        {/* Active Health Profile Badges */}
        {(profile.isCeliac || profile.hasDiabetes || profile.hasObesity || profile.hasDepression) && (
          <div className={`${appTab === 'perfil' ? 'flex' : 'hidden'} bg-white rounded-[24px] p-4 border border-[#EDE8E0] flex-wrap items-center gap-2 text-xs shadow-2xs`}>
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
          <div className={`${appTab === 'inicio' ? 'flex' : 'hidden'} bg-amber-50 border border-amber-200 p-4 rounded-2xl gap-3 text-amber-900 text-sm leading-relaxed`}>
            <span>💡</span>
            <div>
              <strong>Aviso de Bienestar:</strong> He observado que durante varios días consecutivos has registrado indicadores de bienestar elevados (fatiga, dolor, estrés o descanso pobre). Si estos síntomas persisten o afectan tu calidad de vida, considera consultar con un profesional de la salud.
            </div>
          </div>
        )}

        {/* Column 1: Current Phase Details */}
        <div className={`${appTab === 'inicio' ? 'flex' : 'hidden'} flex-col gap-4`}>
          <div className="bg-white rounded-[32px] p-6 md:p-8 shadow-sm border border-[#F0EDE8] flex flex-col flex-1 min-h-[480px]">
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
            <div className="bg-[#FAF8F5] p-4 rounded-2xl border border-[#EDE8E0] mb-6">
              <p className="text-[10px] font-bold text-[#9A9A90] uppercase tracking-widest mb-1">Estado Hormonal</p>
              <p className="text-xs font-medium text-[#5A5A40]">{phaseDetails.hormones}</p>
            </div>

            {/* Cognitive & Physical Stats Progress Bars */}
            <div className="space-y-5">
              <h4 className="text-[10px] font-bold text-[#9A9A90] uppercase tracking-widest">Indicadores de Fase</h4>
              <div>
                <div className="flex justify-between text-[11px] font-bold uppercase tracking-widest text-[#9A9A90] mb-1.5">
                  <span>Concentración</span>
                  <span className="text-[#5A5A40]">{phaseDetails.stats.concentration}%</span>
                </div>
                <div className="h-1.5 w-full bg-[#F0EDE8] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#5A5A40] rounded-full transition-all duration-500"
                    style={{ width: `${phaseDetails.stats.concentration}%` }}
                  ></div>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[11px] font-bold uppercase tracking-widest text-[#9A9A90] mb-1.5">
                  <span>Creatividad</span>
                  <span className="text-[#5A5A40]">{phaseDetails.stats.creativity}%</span>
                </div>
                <div className="h-1.5 w-full bg-[#F0EDE8] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#5A5A40] rounded-full transition-all duration-500"
                    style={{ width: `${phaseDetails.stats.creativity}%` }}
                  ></div>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[11px] font-bold uppercase tracking-widest text-[#9A9A90] mb-1.5">
                  <span>Energía Física</span>
                  <span className="text-[#5A5A40]">{phaseDetails.stats.physicalEnergy}%</span>
                </div>
                <div className="h-1.5 w-full bg-[#F0EDE8] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#5A5A40] rounded-full transition-all duration-500"
                    style={{ width: `${phaseDetails.stats.physicalEnergy}%` }}
                  ></div>
                </div>
              </div>
            </div>

            {/* Autocuidado Tips */}
            <div className="mt-8 pt-6 border-t border-[#F0EDE8] space-y-3">
              <h5 className="text-[10px] font-bold text-[#9A9A90] uppercase tracking-widest">Consejos de autocuidado</h5>
              <ul className="space-y-1.5">
                {phaseDetails.tips.slice(0, 2).map((tip, idx) => (
                  <li key={idx} className="text-xs text-[#5A5A40] flex items-start gap-1.5">
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
                className="w-full bg-[#FAF8F5] hover:bg-[#F2EFE9] border border-[#EDE8E0] text-[11px] font-bold uppercase tracking-wider py-3 rounded-full text-rose-500 hover:text-rose-600 transition-all cursor-pointer text-center"
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
          <div className={appTab === 'calendario' ? 'h-fit' : 'hidden'}>
            <CalendarView
              profile={profile}
              selectedDateStr={selectedDateStr}
              onSelectDate={setSelectedDateStr}
            />
          </div>

          {/* Detailed Recommended Activity for Selected Day */}
          <div className={`${appTab === 'inicio' ? 'flex' : 'hidden'} bg-white rounded-[32px] p-6 shadow-sm border border-[#F0EDE8] flex-col gap-4`}>
            <div className="flex items-center justify-between pb-3 border-b border-[#F0EDE8]">
              <div className="flex items-center gap-2.5">
                <span className="text-2xl">🏃‍♀️</span>
                <div>
                  <h3 className="font-serif font-semibold text-lg text-[#5A5A40]">Actividad Recomendada</h3>
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
              <p className="text-sm text-[#5A5A40] leading-relaxed mb-4">
                {selectedActivity.description}
              </p>
            </div>

            <div className="bg-[#FAF8F5] p-4 rounded-2xl border border-[#EDE8E0]">
              <h5 className="text-[10px] font-bold text-[#9A9A90] uppercase tracking-widest mb-1.5 flex items-center gap-1">
                <span>💡</span> ¿Por qué es adecuada para ti?
              </h5>
              <p className="text-xs text-[#5A5A40] leading-relaxed">
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
          <div className={`grid grid-cols-1 gap-4 ${appTab === 'inicio' || appTab === 'registro' ? '' : 'hidden'}`}>
            
            {/* Productivity Suggested */}
            <div className={`${appTab === 'inicio' ? 'flex' : 'hidden'} bg-[#5A5A40] rounded-[32px] p-6 text-white flex-col justify-between shadow-xs`}>
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
            <div className={`${appTab === 'registro' ? 'flex' : 'hidden'} bg-[#F2EFE9] rounded-[32px] p-6 flex-col justify-between shadow-xs border border-[#E1DCD4]`}>
              <div>
                <h4 className="text-xs font-bold uppercase tracking-widest text-[#9A9A90] mb-4 flex items-center gap-1.5">
                  ❤️ Registro de Bienestar
                </h4>
                
                {activeLog ? (
                  <div className="space-y-3.5">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-semibold text-[#5A5A40]">Sueño:</span>
                      <span className="text-xs font-bold text-[#3A3A35] bg-white px-2.5 py-1 rounded-full border border-[#DED9D0]">
                        {SCALE_LABELS.sleep[activeLog.sleepQuality - 1]}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-semibold text-[#5A5A40]">Estrés:</span>
                      <span className="text-xs font-bold text-[#3A3A35] bg-white px-2.5 py-1 rounded-full border border-[#DED9D0]">
                        {SCALE_LABELS.stress[activeLog.stress - 1]}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-semibold text-[#5A5A40]">Energía:</span>
                      <span className="text-xs font-bold text-[#3A3A35] bg-white px-2.5 py-1 rounded-full border border-[#DED9D0]">
                        {SCALE_LABELS.fatigue === undefined ? 'N/A' : (SCALE_LABELS.fatigue[activeLog.fatigue - 1] === 'Ninguna' ? 'Alta' : 'Moderada')}
                      </span>
                    </div>

                    {/* Text logs details including the new behavior log */}
                    {(activeLog.sleepDetails || activeLog.additionalNotes || activeLog.behavior) && (
                      <div className="mt-4 pt-3 border-t border-[#DED9D0]/60 space-y-2">
                        {activeLog.sleepDetails && (
                          <div className="text-xs bg-white/50 p-2.5 rounded-xl border border-[#EDE8E0] leading-relaxed">
                            <span className="font-bold text-[#5A5A40]">🌙 Noche:</span> <span className="text-[#3A3A35]">{activeLog.sleepDetails}</span>
                          </div>
                        )}
                        {activeLog.additionalNotes && (
                          <div className="text-xs bg-white/50 p-2.5 rounded-xl border border-[#EDE8E0] leading-relaxed">
                            <span className="font-bold text-[#5A5A40]">📝 Notas:</span> <span className="text-[#3A3A35]">{activeLog.additionalNotes}</span>
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
                    <p className="text-[10px] text-[#5A5A40] italic">Tu asistente espera tus datos para dar consejos inteligentes.</p>
                  </div>
                )}
              </div>

              <div className="mt-6 space-y-2">
                <button
                  onClick={() => setIsCheckinOpen(true)}
                  className="w-full bg-white hover:bg-white/80 text-[#5A5A40] text-xs font-bold py-3 rounded-full border border-[#DED9D0] shadow-2xs transition-colors cursor-pointer text-center"
                >
                  {activeLog ? '📝 Editar Registro Diario' : '➕ Registrar Bienestar Hoy'}
                </button>
                
                {activeLog && (
                  <button
                    onClick={handleRequestAnalysisManually}
                    disabled={isAnalyzing}
                    className="w-full bg-[#5A5A40] hover:bg-[#484833] text-white text-xs font-bold py-3 rounded-full shadow-2xs transition-all cursor-pointer text-center"
                  >
                    {isAnalyzing ? '✨ Generando análisis...' : '🔍 Ver Análisis Inteligente'}
                  </button>
                )}
              </div>
            </div>

          </div>
        </div>

        {/* Column 3: Collapsible Chat Panel Sidebar */}
        {appTab === 'chat' && (
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
              previousInteractionId={previousInteractionId}
              environmentId={environmentId}
              onUpdateAgentState={updateAgentState}
            />
          </div>
        )}

        {/* Full Width Symptom and Habit Evolution Graph */}
        <div className={appTab === 'calendario' ? 'mt-1' : 'hidden'}>
          <SymptomChart
            logs={logs}
            profile={profile}
            onLoadDemoData={handleLoadDemoData}
          />
        </div>

        {appTab === 'perfil' && (
          <div className="bg-white rounded-[28px] p-5 border border-[#F0EDE8] flex flex-col gap-3">
            <h2 className="font-serif text-2xl text-[#5A5A40]">Tu perfil</h2>
            <p className="text-xs text-[#7A7A70]">{profile.email || 'Sesión de Cyclia'}</p>
            <button type="button" onClick={() => setIsEditingHealth(true)} className="w-full bg-[#FAF8F5] border border-[#EDE8E0] rounded-2xl py-3 text-sm font-semibold text-[#5A5A40] cursor-pointer">Editar salud</button>
            <button type="button" onClick={handleReRegister} className="w-full bg-[#FAF8F5] border border-[#EDE8E0] rounded-2xl py-3 text-sm font-semibold text-[#5A5A40] cursor-pointer">Nuevo check-in</button>
            <button type="button" onClick={handleResetAppData} className="w-full bg-white border border-red-200 rounded-2xl py-3 text-sm font-semibold text-red-600 cursor-pointer">Restaurar datos</button>
            <button
              type="button"
              onClick={async () => {
                if (confirm('¿Estás segura de que deseas cerrar sesión?')) await signOut();
              }}
              className="w-full bg-[#5A5A40] text-white rounded-2xl py-3 text-sm font-semibold cursor-pointer"
            >
              Cerrar sesión
            </button>
          </div>
        )}

      </main>

      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-white border-t border-[#EDE8E0] grid grid-cols-5 z-40">
        {([
          ['inicio', 'Inicio', '⌂'],
          ['calendario', 'Calendario', '▦'],
          ['registro', 'Registro', '♥'],
          ['chat', 'Chat', '💬'],
          ['perfil', 'Perfil', '☺'],
        ] as const).map(([id, label, icon]) => (
          <button
            key={id}
            type="button"
            onClick={() => setAppTab(id)}
            className={`py-2.5 flex flex-col items-center gap-0.5 text-[10px] font-semibold cursor-pointer ${appTab === id ? 'text-[#5A5A40]' : 'text-[#9A9A90]'}`}
          >
            <span className="text-base leading-none">{icon}</span>
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
        <div className="fixed inset-0 bg-[#3A3A35]/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-[32px] border border-[#EDE8E0] shadow-xl w-full max-w-xl p-6 md:p-8 flex flex-col max-h-[85vh]">
            <div className="flex justify-between items-center pb-4 border-b border-[#EDE8E0] mb-6">
              <div>
                <h3 className="font-serif font-semibold text-lg text-[#5A5A40]">Análisis Inteligente de Cyclia</h3>
                <p className="text-xs text-[#9A9A90] font-medium">{formatFriendlyDate(selectedDateStr)}</p>
              </div>
              <button
                onClick={() => setIsAnalysisOpen(false)}
                className="w-8 h-8 rounded-full border border-[#EDE8E0] text-[#9A9A90] hover:text-[#5A5A40] flex items-center justify-center transition-colors cursor-pointer text-sm"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto pr-1 mb-6">
              {isAnalyzing ? (
                <div className="text-center py-12 space-y-4">
                  <div className="w-10 h-10 border-4 border-t-[#5A5A40] border-[#EDE8E0] rounded-full animate-spin mx-auto"></div>
                  <p className="text-sm font-semibold text-[#5A5A40] animate-pulse">Cyclia está analizando tu registro hormonal e historial diario...</p>
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
                  <div className="whitespace-pre-wrap leading-relaxed bg-[#FAF8F5] p-5 rounded-2xl border border-[#EDE8E0] max-h-[400px] overflow-y-auto">
                    {activeLog.aiAnalysis}
                  </div>
                </div>
              ) : (
                <div className="text-center py-12">
                  <p className="text-sm text-[#7A7A70]">No hay análisis disponible aún. Haz clic en el botón de abajo para generarlo por IA.</p>
                  <button
                    onClick={handleRequestAnalysisManually}
                    className="mt-4 bg-[#5A5A40] hover:bg-[#484833] text-white font-semibold py-2.5 px-6 rounded-full text-xs uppercase tracking-wide cursor-pointer"
                  >
                    Generar Análisis por IA
                  </button>
                </div>
              )}
            </div>

            <div className="border-t border-[#EDE8E0] pt-4 flex justify-end">
              <button
                onClick={() => setIsAnalysisOpen(false)}
                className="bg-[#5A5A40] hover:bg-[#484833] text-white font-semibold py-2.5 px-6 rounded-full text-xs uppercase tracking-wide cursor-pointer"
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
