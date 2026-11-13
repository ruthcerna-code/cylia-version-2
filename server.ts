import express from "express";
import os from "os";
import path from "path";
import dotenv from "dotenv";
import fs from "fs";
import { GoogleGenAI } from "@google/genai";
import { ensureAdminAccount, registerAccountRoutes } from "./accounts.js";
import { registerConsentRoutes } from "./consentRoutes.js";
import { assertConsentFromRequest, ConsentError } from "./consentHttp.js";
import { alignAssist, ASSIST_ACTIVITY_SYSTEM_PROMPT, assistRequestSchema } from "./src/plan/assist.js";
import { alignProposal, extractJson, PLAN_ACTIVITY_SYSTEM_PROMPT, planRequestSchema } from "./src/plan/proposal.js";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3001;

app.set("trust proxy", 1);
app.use(express.json());
app.use((error: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (error instanceof SyntaxError) {
    res.status(400).json({ error: 'La solicitud no tiene un JSON válido.', code: 'bad_request' });
    return;
  }
  next(error);
});

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
Eres Cyclia, una asistente de bienestar. Hablas en español, con un tono cercano y sin juzgar.

Usa solo los datos del contexto. No inventes horas de sueño, energía, fase ni hormonas.
Cyclia no mide hormonas. Si hay fase, es una estimación a partir de la fecha de la regla y la duración del ciclo. Di "muchas mujeres reportan" y no lo presentes como un hecho del cuerpo de esta persona.
Si el contexto dice que no hay fase, no escribas una fase.
Energía, concentración, cansancio, ánimo, estrés y dolor van de 1 a 5. En energía y concentración, 5 es mucho. En sueño, cansancio, ánimo, estrés y dolor, 5 es peor. No inviertas las escalas.
Si hay horas de sueño, úsalas. Menos de 7 horas puede explicar una energía baja. Unas 7 a 9 horas no explican el cansancio por dormir poco.
Si marcó fluido cervical, estado anímico, energía en palabras o sensaciones, usa esas palabras. Clara de huevo no es fertilidad. Inquieta no es energía alta ni baja. Ninguno significa que no marcó esa sensación.
Si registró celiaquía, diabetes, obesidad o depresión, no cambies su tratamiento ni su insulina. Puedes bajar el ritmo de la idea y sugerir consultar si el malestar sigue.

Cyclia no diagnostica ni receta.

FORMATO DE RESPUESTA REQUERIDO:
Siempre que analices un registro diario o des recomendaciones de bienestar completas, intenta estructurar tu respuesta utilizando la siguiente plantilla o secciones similares con emojis:

🌸 Resumen del día
[Tu resumen interpretativo del registro del día]

📅 Fase actual
[Solo si el contexto trae una fase. Si no hay fase, omite esta sección.]

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

function analysisPrompt(context: any): string {
  if (!context || typeof context !== "object") {
    return "No llegó el cálculo del ciclo ni el registro. No inventes una fase ni un porcentaje.";
  }
  const phase = context.showPhases && context.phase
    ? `Fase estimada: ${context.phase}${context.approximate ? ", aproximada" : ""}. Día ${context.cycleDay} de un ciclo de ${context.cycleLength} días. Regla usada: ${context.periodLength} días.`
    : `Sin fase en el calendario. ${context.note || "El modo del ciclo no muestra fases."} Ciclo usado: ${context.cycleLength} días. Regla usada: ${context.periodLength} días.`;
  const conditions = context.conditions || {};
  return `
Analiza solo estos datos.

${phase}
Método hormonal registrado: ${context.hormonalMethod || "ninguna"}.
Situación registrada: ${context.specialSituation || "ninguna"}.
Celiaquía: ${conditions.celiac ? "sí" : "no"}. Diabetes: ${conditions.diabetes ? "sí" : "no"}. Obesidad: ${conditions.obesity ? "sí" : "no"}. Depresión: ${conditions.depression ? "sí" : "no"}.

Registro de este día, con las escalas del sistema.
cervicalFluid: seco, pegajoso, cremoso o clara_de_huevo. feltState: Serena, Enfocada, Radiante, Reflexiva o Sensible. energyFeel: baja, estable, radiante o inquieta. headache, bloating, breastSensitivity y pelvicCramps: ninguno, leve o medio.
${JSON.stringify(context.log || null)}

Otros días recientes, con los mismos campos:
${JSON.stringify(context.recent || [])}

Si no hay fase, omite la sección de fase. Si la hay, dilo como estimación. Máximo 300 palabras.
`;
}

// Endpoint for analyzing a daily check-in
app.post("/api/analyze", async (req, res) => {
  try {
    await assertConsentFromRequest(req, "gemini_assistant");
    const { context, previousInteractionId, environmentId } = req.body;

    if (!context) {
      return res.status(400).json({ error: "Falta el cálculo del ciclo y el registro" });
    }

    const ai = getAI();
    const prompt = analysisPrompt(context);

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
    if (error instanceof ConsentError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    console.error("Error en endpoint de análisis:", error);
    res.status(500).json({ error: error.message || "Error al procesar la solicitud con la IA" });
  }
});

// Endpoint for conversational chat
app.post("/api/chat", async (req, res) => {
  try {
    await assertConsentFromRequest(req, "gemini_assistant");
    const { context, message, chatHistory, previousInteractionId, environmentId } = req.body;

    const ai = getAI();

    const systemInstructionWithContext = `
${CYCLIA_SYSTEM_PROMPT}

DATOS QUE SÍ LLEGARON:
${analysisPrompt(context)}

Responde a la consulta con esos datos. Si pregunta por su ciclo y no hay fase, dilo. No expliques hormonas como si las hubieras medido.
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
    if (error instanceof ConsentError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    console.error("Error en endpoint de chat:", error);
    res.status(500).json({ error: error.message || "Error al procesar el chat con la IA" });
  }
});

registerAccountRoutes(app);
registerConsentRoutes(app);

app.post("/api/plan-activity", async (req, res) => {
  try {
    await assertConsentFromRequest(req, "gemini_assistant");
    const parsed = planRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Faltan el día, la hora o la actividad." });
      return;
    }
    const input = parsed.data;
    const ai = getAI();
    const ask = async (previous: string | null) => {
      const response = await generateContentWithRetry(ai, {
        model: "gemini-3.5-flash",
        contents: previous
          ? `La respuesta anterior no cumplió el formato. Responde solo con el JSON pedido.\nDatos:\n${JSON.stringify(input)}\nRespuesta anterior:\n${previous}`
          : JSON.stringify(input),
        config: {
          systemInstruction: PLAN_ACTIVITY_SYSTEM_PROMPT,
          responseMimeType: "application/json",
        },
      });
      return typeof response.text === "string" ? response.text : "";
    };
    let rawText = await ask(null);
    let proposal = null;
    try {
      proposal = alignProposal(extractJson(rawText), input.hora_inicio, input.fase);
    } catch {
      proposal = null;
    }
    if (!proposal) {
      rawText = await ask(rawText.slice(0, 800));
      try {
        proposal = alignProposal(extractJson(rawText), input.hora_inicio, input.fase);
      } catch {
        proposal = null;
      }
    }
    if (!proposal) {
      res.status(422).json({ error: "Cyclia no pudo armar una propuesta esta vez. Puedes intentarlo de nuevo." });
      return;
    }
    res.json({ proposal });
  } catch (error: any) {
    if (error instanceof ConsentError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    console.error("Error en propuesta de actividad:", error);
    res.status(500).json({ error: "Cyclia no pudo armar una propuesta esta vez. Puedes intentarlo de nuevo." });
  }
});

app.post("/api/assist-activity", async (req, res) => {
  try {
    await assertConsentFromRequest(req, "gemini_assistant");
    const parsed = assistRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Escribe la actividad antes de analizar." });
      return;
    }
    const ai = getAI();
    const ask = async (previous: string | null) => {
      const response = await generateContentWithRetry(ai, {
        model: "gemini-3.5-flash",
        contents: previous
          ? `La respuesta anterior no cumplió el formato. Responde solo con el JSON pedido.\nActividad:\n${parsed.data.texto}\nRespuesta anterior:\n${previous}`
          : parsed.data.texto,
        config: {
          systemInstruction: ASSIST_ACTIVITY_SYSTEM_PROMPT,
          responseMimeType: "application/json",
        },
      });
      return typeof response.text === "string" ? response.text : "";
    };
    let rawText = await ask(null);
    let analysis = null;
    try {
      analysis = alignAssist(extractJson(rawText));
    } catch {
      analysis = null;
    }
    if (!analysis) {
      rawText = await ask(rawText.slice(0, 800));
      try {
        analysis = alignAssist(extractJson(rawText));
      } catch {
        analysis = null;
      }
    }
    if (!analysis) {
      res.status(422).json({ error: "Cyclia no pudo analizar la actividad esta vez. Puedes intentarlo de nuevo." });
      return;
    }
    res.json({ analysis });
  } catch (error: any) {
    if (error instanceof ConsentError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    console.error("Error en Cyclia te asiste:", error);
    res.status(500).json({ error: "Cyclia no pudo analizar la actividad esta vez. Puedes intentarlo de nuevo." });
  }
});

function localNetworkAddresses(): string[] {
  const addresses: string[] = [];
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries || []) {
      const family = entry.family as string | number;
      const ipv4 = family === "IPv4" || family === 4;
      if (!ipv4 || entry.internal) continue;
      if (entry.address.startsWith("169.254.")) continue;
      addresses.push(entry.address);
    }
  }
  return addresses;
}

// Setup Vite Dev Server / Static Files Serving
async function startServer() {
  try {
    await ensureAdminAccount();
  } catch (error) {
    console.error("[Cuentas] No se pudo preparar el usuario administrador:", error);
  }

  const distPath = path.join(process.cwd(), "dist");
  const isProduction = process.env.NODE_ENV === "production" || fs.existsSync(path.join(distPath, "index.html"));

  if (!isProduction) {
    console.log("[Server] Starting in development mode with Vite middleware...");
    app.use(express.static(path.join(process.cwd(), "public")));
    const vitePackage = "vite";
    const { createServer: createViteServer } = await import(vitePackage);
    const vite = await createViteServer({
      server: { middlewareMode: true, allowedHosts: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("[Server] Starting in production mode serving static files from:", distPath);
    app.use(express.static(distPath));
    app.get("*", (req, res, next) => {
      if (req.path.startsWith("/api")) return next();
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Cyclia está en http://localhost:${PORT}`);
    for (const address of localNetworkAddresses()) {
      console.log(`En esta red: http://${address}:${PORT}`);
    }
  });
}

export default app;

if (process.env.VERCEL) {
  const staticDir = path.join(process.cwd(), "public");
  app.use(express.static(staticDir));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    res.sendFile(path.join(staticDir, "index.html"));
  });
} else {
  startServer();
}
