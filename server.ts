import express from "express";
import path from "path";
import dotenv from "dotenv";
import fs from "fs";
import { GoogleGenAI } from "@google/genai";
import { createServer as createViteServer } from "vite";

dotenv.config();

const app = express();
const PORT = 3001;

app.use(express.json());

// Lazy-initialized GoogleGenAI client to prevent startup crash if API key is missing
let aiClient: GoogleGenAI | null = null;
function getAI(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is required");
    }
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiClient;
}

// Resilient helper to handle transient Gemini API errors (like 503 unavailable) via retry & fallback
async function generateContentWithRetry(
  ai: GoogleGenAI,
  params: {
    model: string;
    contents: any;
    config?: any;
  }
): Promise<any> {
  const maxRetries = 2;
  const delayMs = 1000;
  let lastError: any = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        console.log(`[Gemini] Retrying generation with ${params.model} (attempt ${attempt}/${maxRetries})...`);
        await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
      }
      return await ai.models.generateContent(params);
    } catch (err: any) {
      lastError = err;
      console.warn(`[Gemini] Attempt ${attempt} with ${params.model} failed:`, err.message || err);
      // Continue to next retry if we can
    }
  }

  // If retries fail, fallback to gemini-3.1-flash-lite (highly available, fast fallback model)
  const fallbackModel = "gemini-3.1-flash-lite";
  if (params.model !== fallbackModel) {
    console.warn(`[Gemini] All attempts with ${params.model} failed. Falling back to ${fallbackModel}...`);
    try {
      return await ai.models.generateContent({
        ...params,
        model: fallbackModel,
      });
    } catch (fallbackErr: any) {
      console.error(`[Gemini] Fallback to ${fallbackModel} failed:`, fallbackErr.message || fallbackErr);
      throw new Error(`Ambos modelos de inteligencia artificial fallaron. Error original: ${lastError.message || lastError}`);
    }
  }

  throw lastError;
}

// System Instruction for Cyclia
const CYCLIA_SYSTEM_PROMPT = `
Eres Cyclia, una asistente inteligente especializada en bienestar femenino, productividad y salud del ciclo menstrual.
Tu misión es ayudar a cada mujer a comprender cómo su ciclo biológico influye en su energía, emociones, concentración, productividad y bienestar, entregando recomendaciones completamente personalizadas.

Si la usuaria padece alguna condición de salud declarada en su perfil (como celiaquía, diabetes, obesidad o depresión), adapta sutilmente tus recomendaciones y empatiza con cómo influyen estas condiciones en su ciclo biológico (por ejemplo, cómo la progesterona en la fase lútea afecta la sensibilidad a la insulina, o cómo la celiaquía puede sensibilizar el sistema digestivo ante prostaglandinas, o cómo la depresión interactúa con bajones estrogénicos).

Cyclia NO es un médico. Nunca diagnostica enfermedades. Nunca receta medicamentos. Todas las recomendaciones son educativas y de bienestar.
Siempre responde en español.
Tu tono es cercano, amable, empático, profesional, positivo, motivador y sencillo. Nunca juzgues las respuestas de la usuaria.

FORMATO DE RESPUESTA REQUERIDO:
Siempre que analices un registro diario o des recomendaciones de bienestar completas, intenta estructurar tu respuesta utilizando la siguiente plantilla o secciones similares con emojis:

🌸 Resumen del día
[Tu resumen interpretativo del registro del día]

📅 Fase actual
[Análisis de la fase del ciclo en la que se encuentra la usuaria]

💡 Recomendaciones
[Consejos de autocuidado, sueño, ejercicio]

💼 Productividad
[Actividades ideales para hoy, reuniones, enfoque]

❤️ Bienestar
[Recomendaciones para el estado de ánimo, fatiga o dolores]

✨ Consejo del día
[Un mensaje inspirador y amable]

Estilo:
- No escribas respuestas extremadamente largas (máximo 300 palabras).
- Habla en tono constructivo y ameno.
- Si hay indicadores de alerta persistentes (alto estrés, fatiga, etc.), incluye un aviso sutil y amable de consultar a un profesional.
`;

// Resilient helper to handle AntiGravity Agent interactions via the Interactions API
async function runAntigravityInteraction(
  ai: GoogleGenAI,
  params: {
    input: any;
    previousInteractionId?: string;
    environmentId?: string;
    systemInstruction?: string;
  }
): Promise<any> {
  const maxRetries = 1;
  let lastError: any = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        console.log(`[AntiGravity] Retrying interaction (attempt ${attempt}/${maxRetries})...`);
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
      
      const interaction = await ai.interactions.create({
        agent: "antigravity-preview-05-2026",
        input: params.input,
        previous_interaction_id: params.previousInteractionId,
        environment: params.environmentId || "remote",
        system_instruction: params.systemInstruction,
      }, { timeout: 300000 });
      
      return interaction;
    } catch (err: any) {
      lastError = err;
      console.warn(`[AntiGravity] Interaction attempt ${attempt} failed:`, err.message || err);
    }
  }

  throw lastError;
}

// Endpoint for analyzing a daily check-in
app.post("/api/analyze", async (req, res) => {
  try {
    const { profile, log, history, previousInteractionId, environmentId } = req.body;

    if (!profile) {
      return res.status(400).json({ error: "Falta el perfil de usuario" });
    }

    const ai = getAI();
    const prompt = `
Analiza el siguiente registro de bienestar de la usuaria.

Perfil de la usuaria:
- Nombre: ${profile.name}
- Edad: ${profile.age} años
- Ciclo promedio: ${profile.cycleLength} días
- Menstruación promedio: ${profile.periodLength} días
- Método anticonceptivo: ${profile.contraceptive || 'Ninguno'}
- Fase actual: ${profile.currentPhase || 'No calculada'} (Día del ciclo: ${profile.cycleDay || 'N/A'})
- Condiciones de salud:
  * Celíaca/Sensibilidad al gluten: ${profile.isCeliac ? 'Sí' : 'No'}
  * Diabetes/Resistencia a la insulina: ${profile.hasDiabetes ? 'Sí' : 'No'}
  * Obesidad: ${profile.hasObesity ? 'Sí' : 'No'}
  * Depresión/Ansiedad: ${profile.hasDepression ? 'Sí' : 'No'}

Registro diario de hoy:
- Calidad del sueño: ${log.sleepQuality} (1=Excelente, 5=Muy mala)
- Nivel de fatiga: ${log.fatigue} (1=Ninguna, 5=Extrema)
- Dolor muscular/cólicos: ${log.pain} (1=Ninguno, 5=Muy alto)
- Nivel de estrés: ${log.stress} (1=Muy bajo, 5=Muy alto)
- Estado de ánimo: ${log.mood} (1=Muy feliz, 5=Triste/Muy triste)
- Detalle del sueño: "${log.sleepDetails || 'Sin detalles'}"
- Notas adicionales: "${log.additionalNotes || 'Sin comentarios adicionales'}"
- Hábitos y comportamiento de hoy: "${log.behavior || 'Sin registro de hábitos'}"

Historial reciente (últimos días):
${JSON.stringify(history || [])}

Genera un análisis comprensivo y personalizado de acuerdo con su fase biológica actual, considerando sus condiciones de salud especificadas en el perfil si corresponden, y siguiendo la estructura requerida (🌸 Resumen del día, 📅 Fase actual, 💡 Recomendaciones, 💼 Productividad, ❤️ Bienestar, ✨ Consejo del día). Recuerda mantenerlo por debajo de 300 palabras, con un tono muy amable y empático.
`;

    try {
      console.log("[AntiGravity] Running check-in analysis via Antigravity agent...");
      const interaction = await runAntigravityInteraction(ai, {
        input: prompt,
        previousInteractionId,
        environmentId,
        systemInstruction: CYCLIA_SYSTEM_PROMPT,
      });

      // Combine text parts from all model_output steps to avoid truncation
      let fullOutput = "";
      for (const step of interaction.steps) {
        if (step.type === 'model_output') {
          const textContent = step.content?.find((c: any) => c.type === 'text');
          if (textContent && textContent.text) {
            fullOutput += textContent.text;
          }
        }
      }

      res.json({
        analysis: fullOutput || interaction.output_text || "",
        interactionId: interaction.id,
        environmentId: interaction.environment_id,
        steps: interaction.steps,
        usingAgent: true,
      });
    } catch (agentErr: any) {
      console.warn("[AntiGravity] Antigravity analysis failed, falling back to standard Gemini 3.5 Flash:", agentErr.message || agentErr);
      const response = await generateContentWithRetry(ai, {
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
          systemInstruction: CYCLIA_SYSTEM_PROMPT,
        }
      });
      res.json({
        analysis: response.text,
        usingAgent: false,
      });
    }
  } catch (error: any) {
    console.error("Error en endpoint de análisis:", error);
    res.status(500).json({ error: error.message || "Error al procesar la solicitud con la IA" });
  }
});

// Endpoint for conversational chat
app.post("/api/chat", async (req, res) => {
  try {
    const { profile, logs, message, chatHistory, previousInteractionId, environmentId } = req.body;

    const ai = getAI();

    // Inject system instructions + context in user prompt or through system instruction
    const systemInstructionWithContext = `
${CYCLIA_SYSTEM_PROMPT}

CONTEXTO DE LA USUARIA ACTUAL:
- Nombre: ${profile?.name || 'Invitada'}
- Edad: ${profile?.age || 'No provista'} años
- Peso: ${profile?.weight || 'No provisto'} kg, Estatura: ${profile?.height || 'No provista'} cm
- Fase actual del ciclo: ${profile?.currentPhase || 'No calculada'} (Día: ${profile?.cycleDay || 'N/A'})
- Método anticonceptivo: ${profile?.contraceptive || 'Ninguno'}
- Condiciones de salud del perfil:
  * Celíaca/Sensibilidad al gluten: ${profile?.isCeliac ? 'Sí' : 'No'}
  * Diabetes/Resistencia a la insulina: ${profile?.hasDiabetes ? 'Sí' : 'No'}
  * Obesidad: ${profile?.hasObesity ? 'Sí' : 'No'}
  * Depresión/Ansiedad: ${profile?.hasDepression ? 'Sí' : 'No'}
- Últimos registros diarios de bienestar: ${JSON.stringify(logs || [])}

Responde a la usuaria de forma natural y cercana, respetando el tono de Cyclia. Si te pregunta sobre su ciclo, explícale cómo influye su fase actual en su bienestar, productividad, energía y salud (considerando sus condiciones de salud) basándote en este contexto.
`;

    try {
      console.log("[AntiGravity] Running chat via Antigravity agent...");
      let input: any = message;
      
      // Feed conversation context if previousInteractionId is not set yet
      if (!previousInteractionId && chatHistory && chatHistory.length > 0) {
        const historyText = chatHistory.map((msg: any) => `${msg.role === 'user' ? 'Usuaria' : 'Cyclia'}: ${msg.content || msg.text}`).join('\n');
        input = `Historial de conversación previa:\n${historyText}\n\nNueva consulta de la usuaria: ${message}`;
      }

      const interaction = await runAntigravityInteraction(ai, {
        input,
        previousInteractionId,
        environmentId,
        systemInstruction: systemInstructionWithContext,
      });

      // Combine text parts from all model_output steps to avoid truncation
      let fullOutput = "";
      for (const step of interaction.steps) {
        if (step.type === 'model_output') {
          const textContent = step.content?.find((c: any) => c.type === 'text');
          if (textContent && textContent.text) {
            fullOutput += textContent.text;
          }
        }
      }

      res.json({
        reply: fullOutput || interaction.output_text || "",
        interactionId: interaction.id,
        environmentId: interaction.environment_id,
        steps: interaction.steps,
        usingAgent: true,
      });
    } catch (agentErr: any) {
      console.warn("[AntiGravity] Antigravity chat failed, falling back to standard Gemini 3.5 Flash:", agentErr.message || agentErr);
      
      const formattedHistory = (chatHistory || []).map((msg: any) => ({
        role: msg.role === "user" ? "user" : "model",
        parts: [{ text: msg.content || msg.text }]
      }));

      const response = await generateContentWithRetry(ai, {
        model: "gemini-3.5-flash",
        contents: [
          ...formattedHistory,
          { role: "user", parts: [{ text: message }] }
        ],
        config: {
          systemInstruction: systemInstructionWithContext,
        }
      });

      res.json({
        reply: response.text,
        usingAgent: false,
      });
    }
  } catch (error: any) {
    console.error("Error en endpoint de chat:", error);
    res.status(500).json({ error: error.message || "Error al procesar el chat con la IA" });
  }
});

// Setup Vite Dev Server / Static Files Serving
async function startServer() {
  const distPath = path.join(process.cwd(), "dist");
  const isProduction = process.env.NODE_ENV === "production" || fs.existsSync(path.join(distPath, "index.html"));

  if (!isProduction) {
    console.log("[Server] Starting in development mode with Vite middleware...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("[Server] Starting in production mode serving static files from:", distPath);
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, () => {
    console.log(`Cyclia server is running on http://localhost:${PORT}`);
  });
}

startServer();
