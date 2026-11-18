import express from "express";
import os from "os";
import path from "path";
import dotenv from "dotenv";
import fs from "fs";
import Anthropic from "@anthropic-ai/sdk";
import { registerConsentRoutes } from "./consentRoutes.js";
import { assertConsentFromRequest, ConsentError } from "./consentHttp.js";
import { alignAssist, ASSIST_ACTIVITY_SYSTEM_PROMPT, assistConversation, assistRequestSchema, assistUserText, draftAssist, aiKeyLooksUsable } from "./src/plan/assist.js";
import { alignProposal, draftProposal, extractJson, PLAN_ACTIVITY_SYSTEM_PROMPT, planRequestSchema } from "./src/plan/proposal.js";
import { alignBehaviorReport, BEHAVIOR_SYSTEM_PROMPT, behaviorRequestSchema } from "./src/plan/behaviorPrompt.js";

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

// Claude Haiku 5.5: the lowest-cost Claude model. Effort "low" keeps the reasoning, and the bill, short.
const CLAUDE_MODEL = "claude-haiku-5-5";

// Created on first use, so the server starts even without a key.
let aiClient: Anthropic | null = null;
function getAI(): Anthropic {
  if (!aiClient) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("Falta ANTHROPIC_API_KEY en el servidor.");
    }
    // The SDK already retries 429, 5xx and connection errors twice.
    aiClient = new Anthropic({ apiKey });
  }
  return aiClient;
}

function isInvalidAiKey(error: unknown): boolean {
  return error instanceof Anthropic.AuthenticationError || /ANTHROPIC_API_KEY/.test(error instanceof Error ? error.message : "");
}

async function askClaude(system: string, messages: Anthropic.MessageParam[]): Promise<string> {
  const response = await getAI().messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 8000,
    system,
    output_config: { effort: "low" },
    messages,
  });
  if (response.stop_reason === "refusal") {
    throw new Error("Cyclia no puede responder esa consulta. Si es un tema de salud, consúltalo con un profesional.");
  }
  return response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("")
    .trim();
}

/** The API needs the first message to be hers. Earlier Cyclia greetings are dropped. */
function chatMessages(history: unknown, message: string): Anthropic.MessageParam[] {
  const rows: Anthropic.MessageParam[] = (Array.isArray(history) ? history : [])
    .map((item: any) => ({
      role: item?.role === "user" ? "user" as const : "assistant" as const,
      content: String(item?.content ?? item?.text ?? "").trim(),
    }))
    .filter((item) => item.content.length > 0)
    .slice(-20);
  while (rows.length && rows[0].role !== "user") rows.shift();
  rows.push({ role: "user", content: message });
  return rows;
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

Patrón guardado de sus registros, del más antiguo al más reciente. Cada fila es un día que quedó guardado: morning es cómo amaneció, felt es el ánimo elegido, mood y pain son escalas, symptoms es la salud marcada y behavior es el comportamiento. Basa el análisis en este patrón. No inventes días que no estén aquí.
${JSON.stringify(context.pattern || [])}

Días con ánimo y comportamiento registrados: ${Number.isFinite(Number(context.registeredDays)) ? context.registeredDays : "no informado"}.
Racha seguida más larga: ${Number.isFinite(Number(context.continuousDays)) ? context.continuousDays : "no informado"} días.
${context.continuous30 === true ? "Hay al menos 30 días seguidos con ánimo y comportamiento." : "No hay 30 días seguidos con ánimo y comportamiento. Di la cantidad de días registrados y que, sin un registro continuo de 30 días, el análisis puede tener errores."}

Si no hay fase, omite la sección de fase. Si la hay, dilo como estimación. Máximo 300 palabras.
`;
}

// Endpoint for analyzing a daily check-in
app.post("/api/analyze", async (req, res) => {
  try {
    await assertConsentFromRequest(req, "gemini_assistant");
    const { context } = req.body;

    if (!context) {
      return res.status(400).json({ error: "Falta el cálculo del ciclo y el registro" });
    }

    const analysis = await askClaude(CYCLIA_SYSTEM_PROMPT, [{ role: "user", content: analysisPrompt(context) }]);
    res.json({ analysis, usingAgent: false });
  } catch (error: any) {
    if (error instanceof ConsentError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    console.error("Error en endpoint de análisis:", error);
    res.status(isInvalidAiKey(error) ? 503 : 500).json({
      error: isInvalidAiKey(error)
        ? "El asistente no está disponible: falta configurar la clave de la IA en el servidor."
        : "Cyclia no pudo analizar el registro esta vez. Puedes intentarlo de nuevo.",
    });
  }
});

// Endpoint for conversational chat
app.post("/api/chat", async (req, res) => {
  try {
    await assertConsentFromRequest(req, "gemini_assistant");
    const { context, message, chatHistory } = req.body;
    if (typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ error: "Escribe un mensaje." });
    }

    const systemInstructionWithContext = `
${CYCLIA_SYSTEM_PROMPT}

DATOS QUE SÍ LLEGARON:
${analysisPrompt(context)}

Responde a la consulta con esos datos. Si pregunta por su ciclo y no hay fase, dilo. No expliques hormonas como si las hubieras medido.
`;

    const reply = await askClaude(systemInstructionWithContext, chatMessages(chatHistory, message.trim()));
    res.json({ reply, usingAgent: false });
  } catch (error: any) {
    if (error instanceof ConsentError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    console.error("Error en endpoint de chat:", error);
    res.status(isInvalidAiKey(error) ? 503 : 500).json({
      error: isInvalidAiKey(error)
        ? "El asistente no está disponible: falta configurar la clave de la IA en el servidor."
        : "Cyclia no pudo responder esta vez. Puedes intentarlo de nuevo.",
    });
  }
});

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
    if (!aiKeyLooksUsable(process.env.ANTHROPIC_API_KEY)) {
      res.json({ proposal: draftProposal(input) });
      return;
    }
    const ask = (previous: string | null) => askClaude(PLAN_ACTIVITY_SYSTEM_PROMPT, [{
      role: "user",
      content: previous
        ? `La respuesta anterior no cumplió el formato. Responde solo con el JSON pedido.\nDatos:\n${JSON.stringify(input)}\nRespuesta anterior:\n${previous}`
        : JSON.stringify(input),
    }]);
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
    if (isInvalidAiKey(error)) {
      const again = planRequestSchema.safeParse(req.body);
      if (again.success) {
        res.json({ proposal: draftProposal(again.data) });
        return;
      }
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
    if (!aiKeyLooksUsable(process.env.ANTHROPIC_API_KEY)) {
      res.json({ analysis: draftAssist(assistUserText(parsed.data)), fuente: "local" });
      return;
    }
    // The whole conversation goes to Claude, so her answers complete what she said before.
    const conversation = assistConversation(parsed.data);
    const today = parsed.data.hoy;
    const ask = (previous: string | null) => askClaude(ASSIST_ACTIVITY_SYSTEM_PROMPT, previous
      ? [
        ...conversation,
        { role: "assistant", content: previous },
        { role: "user", content: "La respuesta anterior no cumplió el formato. Responde solo con el JSON pedido." },
      ]
      : conversation);
    let rawText = await ask(null);
    let analysis = null;
    try {
      analysis = alignAssist(extractJson(rawText), today);
    } catch {
      analysis = null;
    }
    if (!analysis) {
      rawText = await ask(rawText.slice(0, 800) || "(sin respuesta)");
      try {
        analysis = alignAssist(extractJson(rawText), today);
      } catch {
        analysis = null;
      }
    }
    if (!analysis) {
      res.status(422).json({ error: "Cyclia no pudo analizar la actividad esta vez. Puedes intentarlo de nuevo." });
      return;
    }
    res.json({ analysis, fuente: "ia" });
  } catch (error: any) {
    if (error instanceof ConsentError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    const again = assistRequestSchema.safeParse(req.body);
    if (isInvalidAiKey(error) && again.success) {
      res.json({ analysis: draftAssist(assistUserText(again.data)), fuente: "local" });
      return;
    }
    console.error("Error en Cyclia te asiste:", error);
    res.status(500).json({ error: "Cyclia no pudo analizar la actividad esta vez. Puedes intentarlo de nuevo." });
  }
});

// Monthly behavior pattern: the AI studies one month of aggregated parameters (no free text).
app.post("/api/behavior-pattern", async (req, res) => {
  try {
    await assertConsentFromRequest(req, "gemini_assistant");
    const parsed = behaviorRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Faltan los parámetros del mes." });
      return;
    }
    // Without a key the app writes the pattern itself from the same parameters.
    if (!aiKeyLooksUsable(process.env.ANTHROPIC_API_KEY)) {
      res.json({ report: null, fuente: "local" });
      return;
    }
    const data = JSON.stringify({ actual: parsed.data.actual, anterior: parsed.data.anterior ?? null });
    const ask = (previous: string | null) => askClaude(BEHAVIOR_SYSTEM_PROMPT, previous
      ? [
        { role: "user", content: data },
        { role: "assistant", content: previous },
        { role: "user", content: "La respuesta anterior no cumplió el formato. Responde solo con el JSON pedido." },
      ]
      : [{ role: "user", content: data }]);
    let rawText = await ask(null);
    let report = null;
    try {
      report = alignBehaviorReport(extractJson(rawText));
    } catch {
      report = null;
    }
    if (!report) {
      rawText = await ask(rawText.slice(0, 800) || "(sin respuesta)");
      try {
        report = alignBehaviorReport(extractJson(rawText));
      } catch {
        report = null;
      }
    }
    res.json({ report, fuente: report ? "ia" : "local" });
  } catch (error: any) {
    if (error instanceof ConsentError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    if (isInvalidAiKey(error)) {
      res.json({ report: null, fuente: "local" });
      return;
    }
    console.error("Error en el patrón del mes:", error);
    res.status(500).json({ error: "Cyclia no pudo estudiar tu mes esta vez. Puedes intentarlo de nuevo." });
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

  const distPath = path.join(process.cwd(), "dist");
  // `npm run dev` runs server.ts from source: always use Vite, even if an old dist/ exists.
  // `npm start` runs the bundled dist/server.cjs: serve the build.
  const runningFromSource = /server\.ts$/.test(process.argv[1] || "");
  const isProduction = process.env.NODE_ENV === "production"
    || (!runningFromSource && fs.existsSync(path.join(distPath, "index.html")));

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
