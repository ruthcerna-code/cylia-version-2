import React, { useState, useRef, useEffect } from 'react';
import { UserProfile, DailyLog, ChatMessage } from '../types';

interface ChatPanelProps {
  profile: UserProfile;
  logs: DailyLog[];
  chatHistory: ChatMessage[];
  onAddMessage: (msg: ChatMessage) => void;
  onClearHistory: () => void;
  onOpenHistory?: () => void;
  previousInteractionId: string | null;
  environmentId: string | null;
  onUpdateAgentState: (interId?: string, envId?: string, steps?: any[]) => void;
}

function AgentTrace({ steps }: { steps: any[] }) {
  if (!steps || steps.length === 0) return null;

  return (
    <div className="mb-4 p-3.5 bg-emerald-50/50 border border-emerald-100 rounded-2xl text-xs space-y-2 max-w-full">
      <div className="flex items-center gap-1.5 font-bold text-emerald-800">
        <span className="text-sm">🤖</span>
        <span>Actividades del Agente AntiGravity</span>
      </div>
      <div className="max-h-[140px] overflow-y-auto space-y-1.5 pr-1 text-[11px] leading-relaxed text-[#5A5A48] scrollbar-thin">
        {steps.map((step: any, index: number) => {
          let label = "";
          let icon = "⚡";
          
          if (step.type === 'thought') {
            label = `${step.thought?.summary || 'Analizando la consulta...'}`;
            icon = "🧠";
          } else if (step.type === 'code_execution_call') {
            label = "Ejecutando código en Sandbox de Linux...";
            icon = "💻";
          } else if (step.type === 'code_execution_result') {
            label = "Código ejecutado correctamente.";
            icon = "✅";
          } else if (step.type === 'google_search_call') {
            label = "Buscando en la web con Google Search...";
            icon = "🔍";
          } else if (step.type === 'url_context_call') {
            label = "Analizando contexto de URL...";
            icon = "🌐";
          } else if (step.type === 'function_call') {
            label = `Llamando herramienta: ${step.function_call?.name}`;
            icon = "🔧";
          } else if (step.type === 'model_output') {
            label = "Generando respuesta final...";
            icon = "✍️";
          } else {
            return null;
          }

          return (
            <div key={index} className="flex gap-2 items-start bg-white/80 p-2 rounded-xl border border-[#d7e6d4] shadow-2xs">
              <span>{icon}</span>
              <span className="font-medium">{label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const QUICK_PROMPTS = [
  { label: "🌸 ¿Cómo influye mi fase actual?", text: "Explícame qué está pasando en mi cuerpo hoy y cómo influye en mis emociones y energía." },
  { label: "💼 Ideas de productividad hoy", text: "Tengo que organizar mis tareas de hoy, ¿qué tipo de actividades me recomiendas hacer según mi fase actual?" },
  { label: "🧘‍♀️ Ejercicios y autocuidado", text: "Recomiéndame una rutina de autocuidado y ejercicio ideal para mi fase actual del ciclo." },
  { label: "🥑 ¿Qué comer esta semana?", text: "Sugerencias de alimentación saludable y nutrientes clave para asimilar mejor esta fase." }
];

export default function ChatPanel({
  profile,
  logs,
  chatHistory,
  onAddMessage,
  onOpenHistory,
  previousInteractionId,
  environmentId,
  onUpdateAgentState,
}: ChatPanelProps) {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [activeSteps, setActiveSteps] = useState<any[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, isLoading]);

  const handleSend = async (textToSend: string) => {
    const text = textToSend.trim();
    if (!text) return;

    setInput('');
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      timestamp: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
    };
    onAddMessage(userMsg);

    setIsLoading(true);
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile,
          logs: logs.slice(-5), // Send last 5 logs for context
          message: text,
          chatHistory: chatHistory.slice(-10), // Send last 10 messages for context
          previousInteractionId,
          environmentId,
        })
      });

      if (!response.ok) {
        throw new Error("La respuesta del servidor no fue correcta.");
      }

      const data = await response.json();
      
      if (data.usingAgent) {
        onUpdateAgentState(data.interactionId, data.environmentId, data.steps);
        setActiveSteps(data.steps || []);
      }

      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: data.reply || "No pude generar una respuesta. Por favor intenta de nuevo.",
        timestamp: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
      };
      onAddMessage(assistantMsg);
    } catch (err) {
      console.error("Error en chat:", err);
      const errorMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: "⚠️ Hubo un error al comunicarme con Cyclia. Asegúrate de que la clave de API de Gemini esté configurada en tus secretos.",
        timestamp: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
      };
      onAddMessage(errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  // Helper parser to render Cyclia's structured responses into beautiful visual blocks
  const parseCycliaResponse = (text: string) => {
    if (!text) return null;

    // Detect if we have section headers like "🌸 Resumen del día", "📅 Fase actual", etc.
    const sections = [
      { key: 'resumen', title: 'Resumen del día', icon: '🌸', marker: 'Resumen del día' },
      { key: 'fase', title: 'Fase actual', icon: '📅', marker: 'Fase actual' },
      { key: 'calendario', title: 'Calendario', icon: '🗓', marker: 'Calendario' },
      { key: 'recos', title: 'Recomendaciones', icon: '💡', marker: 'Recomendaciones' },
      { key: 'prod', title: 'Productividad', icon: '💼', marker: 'Productividad' },
      { key: 'bienestar', title: 'Bienestar', icon: '❤️', marker: 'Bienestar' },
      { key: 'consejo', title: 'Consejo del día', icon: '✨', marker: 'Consejo del día' }
    ];

    // Find if the text contains any of these markers
    const hasMarkers = sections.some(sec => text.includes(sec.marker));

    if (!hasMarkers) {
      // Just standard line by line paragraph format
      return (
        <div className="space-y-2 text-sm leading-relaxed whitespace-pre-line text-[#3A3A35]">
          {text}
        </div>
      );
    }

    // Split text into lines to reconstruct nicely formatted blocks
    const lines = text.split('\n');
    const blocks: { type: string; title: string; icon: string; content: string[] }[] = [];
    let currentBlock: { type: string; title: string; icon: string; content: string[] } | null = null;

    lines.forEach((line) => {
      const trimmed = line.trim();
      let matchedSection = null;

      // Check if line contains a section start
      for (const sec of sections) {
        if (trimmed.toLowerCase().includes(sec.marker.toLowerCase())) {
          matchedSection = sec;
          break;
        }
      }

      if (matchedSection) {
        if (currentBlock) {
          blocks.push(currentBlock);
        }
        currentBlock = {
          type: matchedSection.key,
          title: matchedSection.title,
          icon: matchedSection.icon,
          content: []
        };
      } else {
        if (currentBlock) {
          // Clean leading dashes/asterisks or symbols for nicer bullet styling
          let cleanLine = trimmed;
          if (cleanLine.startsWith('*') || cleanLine.startsWith('-')) {
            cleanLine = '• ' + cleanLine.substring(1).trim();
          }
          if (cleanLine) {
            currentBlock.content.push(cleanLine);
          }
        } else {
          // Loose lines at the beginning
          if (trimmed) {
            blocks.push({
              type: 'intro',
              title: '',
              icon: '',
              content: [trimmed]
            });
          }
        }
      }
    });

    if (currentBlock) {
      blocks.push(currentBlock);
    }

    return (
      <div className="space-y-4">
        {blocks.map((block, idx) => {
          if (block.type === 'intro') {
            return (
              <p key={idx} className="text-sm leading-relaxed text-[#3A3A35] whitespace-pre-line">
                {block.content.join('\n')}
              </p>
            );
          }

          // Decide block card styles based on type
          let cardBg = 'bg-[#F5F6F8] border-[#d7e6d4]';
          let titleColor = 'text-[#1E5631]';
          if (block.type === 'resumen') {
            cardBg = 'bg-rose-50/50 border-rose-100';
            titleColor = 'text-rose-700';
          } else if (block.type === 'recos') {
            cardBg = 'bg-emerald-50/50 border-emerald-100';
            titleColor = 'text-emerald-700';
          } else if (block.type === 'prod') {
            cardBg = 'bg-indigo-50/50 border-indigo-100';
            titleColor = 'text-indigo-700';
          } else if (block.type === 'consejo') {
            cardBg = 'bg-amber-50/50 border-amber-100 italic';
            titleColor = 'text-amber-700';
          }

          return (
            <div key={idx} className={`p-4 rounded-2xl border ${cardBg} shadow-2xs`}>
              <h5 className={`font-serif font-bold text-sm flex items-center gap-1.5 mb-2 ${titleColor}`}>
                <span>{block.icon}</span> {block.title}
              </h5>
              <div className="text-xs leading-relaxed text-[#3A3A35] space-y-1">
                {block.content.map((contentLine, cIdx) => (
                  <p key={cIdx} className={contentLine.startsWith('•') ? 'pl-2' : ''}>
                    {contentLine}
                  </p>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="-mx-4 -mt-4 flex min-h-[560px] flex-col">
      <div className="flex items-center gap-3 bg-[#3A44C4] px-4 pb-4 pt-8 text-white">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#F9C4C6] font-serif text-[22px] text-[#3A44C4]">C</div>
        <div className="flex-1">
          <h4 className="text-[19px] font-extrabold">Cyclia IA</h4>
          <p className="text-[13px] text-[#DCE5FA]">Tu asistente de ciclo y bienestar</p>
        </div>
        
        {onOpenHistory && (
          <button
            type="button"
            onClick={onOpenHistory}
            className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full bg-[#F6E27F] text-lg font-extrabold text-[#1B1F5E]"
            title="Historial de conversaciones"
          >
            ◷
          </button>
        )}
      </div>

      {/* Message History */}
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4 min-h-[260px] max-h-[460px]">
        {chatHistory.length === 0 ? (
          <div className="text-center py-8 px-4 space-y-4">
            <p className="text-[#7A7A70] text-sm max-w-xs mx-auto leading-relaxed">
              Hola, <strong className="font-semibold text-[#3A3A35]">{profile.name}</strong>. Estoy aquí para acompañar tu día. ¿Qué te gustaría consultar hoy acerca de tu ciclo, energía o productividad?
            </p>
            
            {/* Quick Suggestions */}
            <div className="grid grid-cols-1 gap-2 pt-2 text-left max-w-sm mx-auto">
              <p className="text-[10px] font-bold text-[#9A9A90] uppercase tracking-widest mb-1 text-center">Temas sugeridos</p>
              {QUICK_PROMPTS.map((prompt, index) => (
                <button
                  key={index}
                  onClick={() => handleSend(prompt.text)}
                  className="min-h-10 cursor-pointer rounded-full bg-[#F6E27F] px-4 py-2 text-left text-[13px] font-bold text-[#1B1F5E]"
                >
                  <span>{prompt.label}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          chatHistory.map((msg) => {
            const isUser = msg.role === 'user';
            return (
              <div
                key={msg.id}
                className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-[24px] p-4 text-sm shadow-2xs ${
                    isUser
                      ? 'bg-[#3A44C4] text-white rounded-br-md'
                      : 'bg-white text-[#1B1F5E] rounded-bl-md'
                  }`}
                >
                  {isUser ? (
                    <p className="whitespace-pre-line leading-relaxed">{msg.content}</p>
                  ) : (
                    parseCycliaResponse(msg.content)
                  )}
                  <p className={`text-[9px] mt-1 text-right block opacity-50 font-medium`}>
                    {msg.timestamp}
                  </p>
                </div>
              </div>
            );
          })
        )}

        {/* Typing loading state */}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-[#F5F6F8] border border-[#d7e6d4] rounded-[24px] rounded-bl-none p-4 text-xs text-[#7A7A70] flex items-center gap-2">
              <span className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-[#1E5631] rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                <span className="w-1.5 h-1.5 bg-[#1E5631] rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                <span className="w-1.5 h-1.5 bg-[#1E5631] rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
              </span>
              <span>Cyclia está pensando...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Agent Reasoning Progress Trace */}
      {activeSteps.length > 0 && (
        <div className="px-1 mt-3">
          <AgentTrace steps={activeSteps} />
        </div>
      )}

      {/* Input box */}
      <div className="mt-auto px-4 pb-3 pt-2">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !isLoading && handleSend(input)}
            placeholder="Pregúntale a Cyclia…"
            disabled={isLoading}
            className="h-12 flex-1 rounded-full border-[1.5px] border-[#C9D3EF] bg-white px-4 text-[15px] text-[#1B1F5E] outline-none"
          />
          <button
            onClick={() => handleSend(input)}
            disabled={isLoading || !input.trim()}
            aria-label="Enviar"
            className="flex h-12 w-12 cursor-pointer items-center justify-center rounded-full bg-[#F49A9E] text-lg font-extrabold text-[#1B1F5E] disabled:opacity-50"
          >
            →
          </button>
        </div>
      </div>

    </div>
  );
}
