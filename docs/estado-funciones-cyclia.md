# Estado real de las funciones de Cyclia (revisión del código)

Rama revisada: `reenfoque-energia`, commit `275b097` (17-11-2026).
Objetivo: contrastar la lista de funciones del plan Plus y del plan gratis con lo que hoy existe en el código, para saber qué se puede reutilizar y qué hay que construir.

## Cómo está armada la app (lo mínimo para orientarse)

- **Front:** React 19 + Vite. Todo se monta desde `src/App.tsx`.
- **Servidor:** Express en `server.ts`. Hay cuatro rutas de IA: `/api/analyze`, `/api/chat`, `/api/plan-activity` y `/api/assist-activity`. Las rutas de consentimiento y datos están en `consentRoutes.ts`.
- **IA:** Google Gemini (`@google/genai`). El análisis y el chat intentan primero el agente `antigravity-preview-05-2026` y, si falla, usan `gemini-3.5-flash`, con `gemini-3.1-flash-lite` como último respaldo.
- **Datos:** Firebase Auth + Firestore, en `users/{uid}/daily_logs`, `period_records`, `messages`, `activities` y `consent_events`.
- **Consentimiento:** las cuatro rutas de IA llaman a `assertConsentFromRequest(req, "gemini_assistant")` (`consentHttp.ts:189`). Sin un token Bearer válido y sin la autorización `gemini_assistant` aceptada, responden 401 o 403.
- **Plan Plus:** **no existe en el código.** No hay suscripción, pago, bandera `isPlus` ni pantalla de cobro. Lo único que separa "con IA" de "sin IA" es el consentimiento `gemini_assistant`.

> **Código muerto con piezas útiles.** Estos archivos están en el repositorio, pero **ninguna pantalla los importa** (quedaron fuera cuando "Organiza tu día" pasó a ser la única agenda, commit `cff5c04`):
> `src/components/OrganizaDia.tsx`, `src/components/AgendaScreen.tsx`, `src/components/FocusModule.tsx`, `src/utils/dayPlan.ts`, `src/utils/dayPlanStore.ts`, `src/focus/logic.ts` y `src/focus/store.ts`.
> No se ven en la app, pero tienen lógica que sirve para las funciones 1, 2 y 11. Más abajo se indica qué se puede rescatar.

---

## Resumen

| # | Función | Estado en tu lista | Estado real en el código | Nota rápida |
|---|---|---|---|---|
| 1 | Hoy es un día difícil | Pendiente | **Construida en local (sin commit)** | `src/plan/difficultDay.ts` + `DifficultDaySheet.tsx`, en Organiza tu día. Ver "Avance" al final |
| 2 | Tu patrón propio | Pendiente | **Construida en local (sin commit)** | `src/utils/ownPattern.ts` + `OwnPatternCard.tsx`, en la pestaña Ciclo. Ver "Avance" al final |
| 3 | Cyclia te asiste | Implementado | **Implementado**, con una salvedad | Sin una clave de Gemini válida, responde una plantilla local, no la IA |
| 4 | Análisis del día con IA | Implementado | **Implementado**, con un error | El botón "pedir análisis" no envía el token: el servidor siempre lo rechaza (401) |
| 5 | Chat Cyclia IA | Implementado | **Implementado** | Pide consentimiento, guarda el historial y el prompt prohíbe diagnosticar |
| 6 | Tendencia de 30 días (bochornos) | Pendiente | **Pendiente**, con el modelo de datos listo | Los campos `hotFlashCount` y `hotFlashIntensity` existen, pero ninguna pantalla los llena |
| 7 | Informe para la consulta (PDF) | Pendiente | **Pendiente**, desde cero | Solo existe la exportación JSON de los datos de la cuenta |
| 8 | Agente de planificación adaptativa | Propuesta | **No existe** (hay precursores) | La propuesta de duración explica el motivo y pide aceptar, pero no aprende |
| 9 | Google Calendar | Propuesta | **Retirada**; quedan restos | Ya hubo una integración: quedan el consentimiento y los campos `googleEventId` y `syncStatus` |
| 10 | Memoria de preferencias | Propuesta | **No existe** | — |
| 11 | Registro por voz | Propuesta | **No existe** (solo dictado en código muerto) | `FocusModule.tsx` usa el dictado del navegador, sin IA y sin pantalla |
| 12 | Registro por WhatsApp | Propuesta | **No existe** | — |

Plan gratis: casi todo está, pero **el recordatorio no funciona**. Se guarda la preferencia y se pide el permiso del navegador, pero ningún código envía la notificación. El detalle está más abajo.

---

## Plus del MVP

### 1. Hoy es un día difícil — PENDIENTE

**Qué hay hoy en la pantalla visible (`src/components/plan/OrganizaTuDia.tsx`):**
- Marcar una actividad como hecha o "No", que guarda `planStatus: 'pospuesta'`.
- Deshacer **una** actividad durante 5 segundos (`undo`, líneas 77 y 116). Solo vive en la memoria del componente.
- "Reprogramar" abre la hoja de creación con la fecha de hoy. No propone otra fecha.

**Qué hay en código muerto y se puede reutilizar (`src/utils/dayPlan.ts`):**
- `buildDayPlan(activities, date, availableMinutes, energy)` separa las actividades en `fixed` (con hora), `packed` (caben, como máximo 3) y `waiting` (puede esperar). Ordena por vencimiento, importancia y dependencias (`autoSort`). Con energía ≤ 2 elige el paso más corto.
- `overrunMessage()` decide qué actividad deja de caber cuando el día se alarga.
- `moveInSequence()` avisa si un cambio rompe una dependencia o una fecha de vencimiento.
- `src/focus/logic.ts → suggestDate()` busca un día futuro según la energía registrada. Lee check-ins de `localStorage` y no `daily_logs`, así que habría que adaptarlo.

**El modelo de datos ya alcanza.** `ScheduledActivity` (`src/types.ts`) tiene `importance`, `deadline`, `effort`, `estimateMinutes`, `steps[]`, `dependsOn`, `planStatus` y `sortOrder`.

**Qué hay que construir:**
1. Una función pura, por ejemplo `replanDifficultDay(activities, date, energy)` en `src/plan/`, que devuelva tres grupos:
   - **Se mantiene:** con hora fija, vence hoy o tiene importancia alta.
   - **Se acorta:** nueva duración, por ejemplo 50–65 % (`draftProposal` ya usa 0.65 con poca energía), y los pasos que se conservan. **Este grupo no existe hoy.**
   - **Puede esperar:** con **fecha propuesta**, el primer día con espacio antes del `deadline`, que nunca debe quedar después del vencimiento.
2. Un botón "Hoy es un día difícil" en `OrganizaTuDia`, más una hoja de vista previa con los tres grupos. Puede seguir el patrón de `ProposalCard.tsx`.
3. **Aprobación explícita:** no se escribe nada en Firestore hasta que ella confirme. Debería poder quitar tareas de un grupo antes de confirmar.
4. **Aplicar en grupo:** varias llamadas a `onSaveActivity` (o un `writeBatch` de Firestore, para que el cambio sea todo o nada).
5. **Deshacer en grupo:** guardar una copia de todas las actividades antes del cambio. El deshacer actual de 5 segundos y en memoria no sirve: el deshacer del replan debería durar al menos hasta el final del día y sobrevivir a una recarga (por ejemplo, la copia guardada en Firestore o en `sessionStorage`).
6. Decidir si usa IA. Se puede hacer 100 % con reglas locales, que funcionan sin la clave de Gemini y sin el consentimiento de IA. Si es Plus, la restricción va aparte, porque hoy no existe.

### 2. Tu patrón propio — PARCIAL (no está en cero)

**Qué ya existe y se ve:** `compareRecords()` en `src/utils/recordCompare.ts:127` se muestra en la pestaña Ciclo, bajo "Tus registros y la proyección" (`src/App.tsx:1249`). Ya:
- Cuenta los días con energía, cansancio o sueño ("Según tus registros hay N días…").
- Cruza la energía baja con el sueño: corto, suficiente o 7–9 h.
- Calcula la energía promedio por fase **con cuántos registros** ("En Lútea, tu energía promedio es X de 5, con N registros").
- No usa fases cuando el modo del ciclo no las muestra (`showPhases`).

**Por qué no cumple todavía lo que promete la función:**
- **No hay regla de 2 semanas.** Muestra frases desde el primer registro.
- **Los umbrales son muy bajos.** Basta con 2 registros por fase. `majority()` con un solo día de energía baja ya da un "patrón".
- **No dice "no hay patrón".** Siempre devuelve alguna frase. Cuando los datos no alcanzan, debería decirlo con claridad.
- **No tiene ventana de tiempo.** Usa todos los registros, sin un período definido.
- No es una pantalla ni un momento de producto ("después de 2 semanas te mostramos…"). Hoy son líneas dentro de una tarjeta.

**Código muerto aprovechable:** `src/focus/logic.ts → discoveries()`, `energyByDay()` y `cyclesWithData()` buscan la "mejor ventana de 5 días" y exigen ≥ 2 ciclos. Leen el `localStorage` de Mi Foco, no `daily_logs`.

**Qué hay que construir:**
1. `findOwnPattern(profile, periods, logs, today)` en `src/utils/`, que devuelva `{ ready: boolean, findings: [{ texto, registros }], sinPatron: boolean }`.
2. Una regla de habilitación: ≥ 14 días desde el primer registro **y** un mínimo de registros, por ejemplo 10 con energía.
3. Umbrales por hallazgo, por ejemplo ≥ 5 registros por grupo y una diferencia mínima de energía de 0,7 puntos. Si ninguno se cumple: "Con tus registros todavía no aparece un patrón".
4. Las tres dimensiones de la promesa: **ciclo** (fase o día del ciclo, solo si `showPhases`), **sueño** (`readSleep`) y **energía**.
5. Una tarjeta o pantalla propia con el número de registros que respalda cada frase.
6. Reemplazar `compareRecords` o dejarlo como la versión gratuita y esta como la Plus. Hay que decidirlo antes de construir.

### 3. Cyclia te asiste — IMPLEMENTADO

- UI: `src/components/plan/CycliaTeAsiste.tsx`, que se abre desde el botón amarillo de `OrganizaTuDia`.
- Servidor: `POST /api/assist-activity` (`server.ts:421`). Prompt y validación en `src/plan/assist.ts`.
- Cumple lo prometido: de 2 a 5 pasos (`alignAssist` exige ≥ 2 y corta en 5), esfuerzo bajo, medio o alto con su motivo, y duración en múltiplos de 5 entre 10 y 480 min. Si el texto es vago, pide un solo dato (`necesita_datos`). Si Gemini no responde en el formato pedido, lo reintenta una vez.
- **Salvedad:** si `GEMINI_API_KEY` falta o es inválida, el servidor responde con `draftAssist()` (`fuente: "local"`). Eso es una **plantilla fija de 3 pasos**, no IA. Para la preventa, conviene comprobar que producción tenga una clave válida y mostrar en la UI cuándo la respuesta es local.

### 4. Análisis del día con IA — IMPLEMENTADO, con un error

- Servidor: `POST /api/analyze` (`server.ts:206`), con el prompt `CYCLIA_SYSTEM_PROMPT` y el contexto que arma `buildAnalysisContext()` (`src/utils/analysisContext.ts`).
- Consentimiento: el servidor lo exige, y el cliente no envía nada si no está aceptado (`geminiEnabledRef`, `App.tsx:457`).
- El análisis se guarda en el registro del día (`aiAnalysis`).
- **Error (corregido):** `handleRequestAnalysisManually` (`src/App.tsx:491`) llamaba a `/api/analyze` **sin la cabecera `Authorization`**, así que `requireSession` respondía 401 y el botón "pedir análisis" siempre fallaba. Ahora envía el token, igual que el análisis automático, y muestra el mensaje del servidor (por ejemplo, la falta de autorización) en lugar de un error de conexión genérico.
- No tiene respaldo local: sin clave de Gemini, falla.

### 5. Chat Cyclia IA — IMPLEMENTADO

- UI: `src/components/ChatPanel.tsx`. Servidor: `POST /api/chat` (`server.ts:270`).
- Pide el consentimiento `gemini_assistant` y envía el token. El historial se guarda en `users/{uid}/messages`.
- El prompt dice "Cyclia no diagnostica ni receta" y "no cambies su tratamiento ni su insulina". Usa solo los datos del contexto.
- Pendiente de validar: no hay pruebas automáticas que comprueben que no diagnostica. Conviene una lista de preguntas trampa revisada a mano antes de la preventa.

---

## Durante el build

### 6. Tendencia de 30 días (bochornos) — PENDIENTE, con base de datos lista

- **Existe:** `DailyLog.hotFlashCount`, `hotFlashIntensity` (1–3), `nightSweatCount` y `nightSweatIntensity` en `src/types.ts:77`. `src/firebase.ts` ya los guarda y los lee (líneas 256 y 288).
- **Existe:** el síntoma "Bochornos" (sí o no), que se muestra en el registro si la edad es ≥ 40 o el modo es perimenopausia o menopausia (`App.tsx:1050`, `DesignRegister.tsx:295`).
- **Falta:**
  - Una UI que capture **cuántos** bochornos y **qué intensidad**. Hoy `DesignRegister` solo copia el valor anterior y ninguna pantalla lo pide.
  - Una función que agrupe 30 días por semana: conteo semanal e intensidad promedio.
  - Un gráfico. `SymptomChart.tsx` sirve como base, pero está fijo en 7 días.
  - Mostrarla solo en los modos `perimenopause` y `menopause`.

### 7. Informe para la consulta (PDF) — PENDIENTE, desde cero

- Solo existe `downloadOwnData()` (`src/dataExport.ts`), que descarga **JSON** con todos los datos (derecho de acceso, no es un informe).
- **Hay que construir:** una selección de 3 meses (ciclos de `period_records`, sangrado y volumen, síntomas de `daily_logs`, alertas de `analyzeCycle().alerts`), el diseño del informe y la generación del PDF. Puede hacerse en el navegador (por ejemplo, una vista imprimible con `window.print()`) o en el servidor.
- Requiere validación clínica del contenido y de las alertas antes de publicarlo.

### 8. Agente de planificación adaptativa — NO EXISTE (hay precursores)

- **Precursor:** `POST /api/plan-activity` (`src/plan/proposal.ts`) propone **cuánto tiempo** dedicar a una actividad, con un `motivo` (explica la recomendación) y una `ProposalCard` que ella acepta o rechaza (pide permiso). Si rechaza, `propuesta_anterior_min` hace que la siguiente propuesta sea distinta.
- **Precursor:** `durationSource: 'cyclia' | 'manual'` en cada actividad registra si aceptó la propuesta o eligió ella los minutos. Es el dato básico para "aprender de sus correcciones", pero hoy nadie lo lee.
- **Falta:** proponer el plan del **día completo** (no una actividad), guardar y usar las correcciones (ver la función 10) y un registro de decisiones.

### 9. Conexión con Google Calendar — RETIRADA; quedan restos

- Ya hubo una integración. Quedan:
  - El propósito de consentimiento `google_calendar` (`src/consentCopy.ts:45`).
  - La etiqueta "Google Calendar, integración retirada" en `PrivacyDataScreen.tsx:17`.
  - Los campos `syncStatus`, `googleEventId`, `googleCalendarId` y `syncError` en `ScheduledActivity`.
- No queda código que llame a la API de Calendar. Al retomarla habrá que decidir si se reutilizan esos campos y ese propósito de consentimiento (cambiar el texto implica cambiar `CONSENT_VERSION`). También hará falta OAuth con el permiso de Calendar y el flujo "leer → proponer → aprobar → escribir".

### 10. Memoria de preferencias — NO EXISTE

- No hay una colección ni un campo de preferencias en `UserProfile` ni en Firestore. El perfil tiene objetivos, pero no preferencias aprendidas.
- **Hay que construir:** una colección `users/{uid}/preferences` (texto, origen, fecha), una lista visible y borrable en Perfil, su uso en los prompts de plan y agenda, y su inclusión en `/api/account/export` y en el borrado de la cuenta.

---

## Futuro

### 11. Registro por voz — NO EXISTE

- Solo `FocusModule.tsx` (código muerto, líneas 59–60) usa `SpeechRecognition` del navegador para dictar el título de una tarea. Esto no es IA, no funciona en todos los navegadores y no crea un registro del día.
- Hay que construir: la grabación, la transcripción, la extracción de campos de `DailyLog` con la IA, la confirmación antes de guardar y un consentimiento nuevo (es audio con datos de salud).

### 12. Registro por WhatsApp — NO EXISTE

- No hay nada. Requiere la WhatsApp Business API, la vinculación del número con la cuenta, un webhook en el servidor y una revisión legal (datos de salud por un tercero).

---

## Plan gratis: verificación

| Función gratis | Estado | Dónde está |
|---|---|---|
| Seguimiento del ciclo | ✅ Está | `src/utils/cycleModel.ts` (`analyzeCycle`, `projectCycleBoard`), `CalendarView`, `CycleProjectionScreen` |
| Registro diario | ✅ Está | `DesignRegister.tsx` (y `DailyCheckin.tsx`) → `users/{uid}/daily_logs` |
| Modos de etapa (incluida la perimenopausia) | ✅ Está | `cycleModel.ts`: modos `natural`, `hormonal`, `perimenopause`, `menopause` y `paused`, con alertas (por ejemplo, sangrado en la menopausia) |
| Plan del día básico | ✅ Está, con matiz | `OrganizaTuDia` + `CreateActivitySheet`. La propuesta de duración pasa por `/api/plan-activity`, que **pide el consentimiento de IA**. Sin la clave usa `draftProposal` local, pero sin el consentimiento la ruta responde 403. Si debe ser gratis y sin IA, la propuesta local tiene que poder llamarse sin pasar por esa ruta. |
| Recordatorio | ⚠️ **Incompleto** | `CyclePrivacySettings.tsx` guarda `cycleReminders` y pide `Notification.requestPermission()`, pero **ningún código envía la notificación** (no hay `new Notification`, service worker ni envío desde el servidor). `reminderMinutes` en las actividades siempre se guarda como `null`. |
| Evolución de 7 días | ✅ Está | `SymptomChart.tsx`, en Ciclo → "Evolución de bienestar" |
| Privacidad | ✅ Está | Consentimiento versionado (`consentCopy.ts`, `consentRoutes.ts`), historial, retiro, exportación (`/api/account/export`) y solicitudes de datos |

---

## Riesgo para la preventa (corroborado)

Tu lectura se confirma y se refina:

- El Plus de hoy **depende del todo de Gemini** (funciones 3, 4 y 5). Además, **no existe ningún mecanismo de Plus**: hay que construir el plan, el cobro y la restricción antes de cobrar.
- **"Tu patrón propio"** no parte de cero: `compareRecords()` es una base. El trabajo real es ponerle reglas (2 semanas, mínimos, "no hay patrón") y darle una pantalla propia. **Esfuerzo estimado: bajo a medio.**
- **"Hoy es un día difícil"** tiene la lógica de agrupar en `dayPlan.ts` (código muerto). Falta "se acorta", la fecha propuesta y la aprobación con deshacer en grupo. **Esfuerzo estimado: medio.**
- Antes de la preventa conviene además:
  1. Arreglar el 401 de "pedir análisis" (`App.tsx:501`).
  2. Asegurar una clave de Gemini válida en producción, para que "Cyclia te asiste" no responda con la plantilla local sin avisar.
  3. Completar el recordatorio, que aparece como gratis pero no envía nada.
  4. Decidir qué hacer con el código muerto: rescatar `dayPlan.ts` y `focus/logic.ts` y borrar el resto, para que nadie lo confunda con funciones activas.

## Orden sugerido de desarrollo

1. Corregir el 401 del análisis manual (una línea).
2. Tu patrón propio (reutiliza `compareRecords`).
3. Hoy es un día difícil (reutiliza `dayPlan.ts`).
4. Recordatorio funcional (plan gratis).
5. El mecanismo de Plus (suscripción y restricción por función).
6. Tendencia de 30 días (los datos ya están; falta la captura y el gráfico).
7. Informe PDF (con validación clínica).

---

## Avance (17-11-2026, versión local, sin commit)

### Tu patrón propio
- **Lógica:** `src/utils/ownPattern.ts → findOwnPattern(profile, periods, logs, today)`.
  - Lee los registros de los últimos 90 días. Usa la energía (1–5); si no se marcó, toma el cansancio al revés.
  - **Regla de habilitación:** ≥ 14 días desde el primer registro y ≥ 10 registros con energía. Antes de eso dice cuántos días y registros faltan.
  - **Sueño y energía:** compara los días con sueño corto o malo con los días de buen sueño (`readSleep`). Exige ≥ 4 registros por grupo y una diferencia ≥ 0,7.
  - **Ciclo y energía:** compara la fase más alta con la más baja, solo si el modo muestra fases (`showPhases`). Exige ≥ 4 registros por fase y una diferencia ≥ 0,7.
  - Cada hallazgo dice **cuántos registros lo respaldan**. Si no hay ninguno: "todavía no aparece un patrón claro… No inventamos uno".
  - Los umbrales son constantes exportadas (`PATTERN_MIN_DAYS`, `PATTERN_MIN_RECORDS`, `PATTERN_MIN_GROUP`, `PATTERN_MIN_GAP`), para ajustarlos con el equipo clínico.
- **Pantalla:** `src/components/OwnPatternCard.tsx`, en la pestaña Ciclo, debajo de "Tus registros y la proyección" (que se mantiene como está).
- No usa IA ni envía datos fuera de la app.

### Hoy es un día difícil
- **Lógica:** `src/plan/difficultDay.ts → replanDifficultDay(activities, date)`. Es una función pura: solo propone.
  - **Se mantiene:** vence hoy, importancia alta, actividad de cuidado o descanso, o dura ≤ 20 min.
  - **Puede esperar:** importancia baja, esfuerzo alto, ya marcada "no realizada", o depende de otra que se mueve. **Fecha propuesta:** el día con menos carga y sin choque de horario dentro de 7 días, que nunca pasa del `deadline`. Si depende de otra, nunca queda antes de ella.
  - **Se acorta:** el resto. Queda en el 60 % del tiempo (mínimo 15 min, en múltiplos de 5), con una nueva hora de término y solo los pasos que caben.
  - `regroup()` deja que ella mueva cualquier actividad a otro grupo antes de aprobar.
- **Pantalla:** el botón "Hoy es un día difícil" en Organiza tu día (aparece si hoy hay actividades sin terminar) abre `DifficultDaySheet.tsx` con los tres grupos, el motivo, el nuevo horario o la fecha propuesta, y los botones Mantener, Acortar y Otro día.
- **Aprobación:** no se guarda nada hasta "Aprobar N cambios". Se guarda todo o nada: si falla una escritura, se revierten las anteriores.
- **Deshacer:** se guarda una copia de las actividades antes del cambio en `localStorage` (`cyclia_replan_undo`), válida durante el día y después de recargar. Un aviso con "Deshacer" y "Listo" reemplaza al botón mientras la copia está vigente. Solo aparece si todas las actividades de la copia pertenecen a la cuenta abierta.
- No usa IA. Funciona sin la clave de Gemini y sin el consentimiento de IA.

### Pendiente de estas dos funciones
- Probarlas con una cuenta real en el navegador (requieren sesión iniciada).
- Restringirlas a Plus cuando exista el mecanismo de suscripción.
- Revisar los umbrales del patrón y las reglas de agrupación con el equipo de producto y el equipo clínico.

### Corrección del servidor local
- `npm run dev` arrancaba en "modo producción" y servía la compilación vieja de `dist/` cada vez que existía `dist/index.html`. Por eso los cambios en `src/` no se veían en local.
- Ahora `server.ts` usa Vite siempre que se ejecuta desde el código fuente (`tsx server.ts`). Solo sirve `dist/` con `NODE_ENV=production` o cuando corre el paquete compilado (`npm start`).

### Verificación (17-11-2026)
- Probadas en el navegador con datos de ejemplo, en una vista temporal que ya se borró: las tres variantes de "Tu patrón propio" (con patrón, faltan datos, sin patrón) y el flujo completo de "Hoy es un día difícil" (proponer, aprobar 3 cambios y deshacer).
- Falta probarlas con una cuenta real y con Firestore.
- La clave `GEMINI_API_KEY` del `.env` local es inválida ("API key not valid"): el análisis del día y el chat fallan en local.

---

## Cambio de proveedor de IA: de Gemini a Claude (17-11-2026, sin commit)

- **Modelo:** `claude-haiku-5-5` (Claude Haiku 5.5, el más barato), con `output_config.effort: "low"`. Librería `@anthropic-ai/sdk`; se quitó `@google/genai`.
- **Servidor (`server.ts`):** un solo ayudante, `askClaude(system, messages)`, que usan las cuatro rutas (`/api/analyze`, `/api/chat`, `/api/plan-activity`, `/api/assist-activity`). Se eliminaron el agente "Antigravity" de Google y la cadena de reintentos propia (la librería ya reintenta los errores 429 y 5xx). Si Claude rechaza una consulta (`stop_reason: "refusal"`), Cyclia responde con un mensaje que sugiere consultar con un profesional.
- **Clave:** `ANTHROPIC_API_KEY` en `.env` (local) y en Vercel (producción). Sin una clave válida, la propuesta de duración y Cyclia te asiste usan sus respaldos locales; el análisis y el chat responden 503 con un mensaje claro.
- **Consentimiento:** el texto de la autorización opcional ahora dice "Anthropic (Claude)". `CONSENT_VERSION` pasó a `2026-11-borrador-2`, así que **todas las cuentas vuelven a ver la pantalla de consentimiento** al entrar. El identificador interno sigue siendo `gemini_assistant`, para no romper los registros ni las reglas de Firestore.
- **Textos actualizados:** Privacidad y datos, los borradores legales, el error del chat, Cyclia te asiste, `.env.example` y `README.md`.
- **Pendiente:** probar las cuatro rutas con una clave real y revisar con la asesoría legal la política de datos de Anthropic para datos de salud.
