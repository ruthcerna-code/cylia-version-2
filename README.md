# Cyclia

Cyclia es una app de teléfono para el bienestar femenino. Conecta el ciclo menstrual con la energía de hoy, la organización del día y el bienestar diario. Estima la fase del ciclo, guarda registros diarios, ayuda a planificar las actividades y ofrece un asistente de IA.

La interfaz está hecha para la pantalla del celular: una sola columna de hasta 480 px y una barra de siete pestañas abajo. Hoy se abre en el navegador. Todavía no es un paquete de Google Play.

> Cyclia es educativa y de bienestar: no diagnostica ni receta, y no reemplaza a un profesional de salud.

Repositorio: https://github.com/ruthcerna-code/cylia-version-2
Rama principal: `main`. El trabajo se hace en `develop` o en ramas de función (por ejemplo `reenfoque-energia`).

## Tecnologías

- **Interfaz:** React 19, Vite 6 y Tailwind 4.
- **Servidor:** Node.js y Express (`server.ts`). En local escucha en `http://localhost:3001`, o en el puerto de la variable `PORT`.
- **Datos y acceso:** Firebase Auth y Cloud Firestore, en el proyecto `cyclia-mvp`.
- **Cuentas:** correo y contraseña en Firebase Authentication. El servidor no guarda cuentas.
- **Asistente de IA:** Claude Haiku 5.5 (Anthropic), llamado desde el servidor con `ANTHROPIC_API_KEY`, solo si la persona lo autorizó.
- **Pruebas:** Vitest y Supertest (`npm test`).

## Ejecutar la aplicación

Requisitos: Node.js (probado con la versión 24).

```bash
npm install
cp .env.example .env    # completa las variables
npm run dev             # http://localhost:3001
```

Variables de entorno (ver `.env.example`):

| Variable | Para qué sirve |
|----------|----------------|
| `ANTHROPIC_API_KEY` | Clave de Claude (Anthropic). Solo en el servidor. Sin ella, el análisis y el chat no responden; la propuesta de duración y Cyclia te asiste usan un cálculo local. Guía paso a paso: [docs/configurar-clave-claude.md](docs/configurar-clave-claude.md) |
| `APP_URL` | Origen de la app. En local, `http://localhost:3001` |
| `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID` | Configuración pública de Firebase. Sin `VITE_FIREBASE_API_KEY` no se puede entrar con correo |

El archivo `.env` no se sube a Git. En producción, las mismas variables van en Vercel (**Settings → Environment Variables**).

Scripts:

| Comando | Qué hace |
|---------|----------|
| `npm run dev` | Servidor de desarrollo con Vite. Siempre usa el código de `src/`, aunque exista una carpeta `dist/` |
| `npm run build` y luego `npm start` | Compila y sirve la versión de producción desde `dist/` |
| `npm test` | Corre las pruebas automáticas una vez |
| `npm run test:watch` | Vuelve a correr las pruebas al guardar |
| `npm run catalog:build` | Regenera `src/catalog/movementCatalog.ts` desde `src/catalog/catalogo-salud-fisica.csv`. Se detiene con un mensaje si no hay 120 filas, si un N.º se repite o si la energía no está entre 1 y 5 |

El servidor lee el `.env` solo al arrancar: después de cambiar una variable o `server.ts`, hay que reiniciarlo.

## Reglas de Firestore

Las reglas viven en `firestore.rules` y **hay que publicarlas** para que valgan en Firebase. Se publican con:

```bash
npx firebase-tools login
```

```bash
npx firebase-tools deploy --only firestore:rules --project cyclia-mvp
```

- **Cada colección nueva necesita su regla publicada.** En Firestore, lo que no tiene regla está prohibido: si se agrega una colección al código y no se publica su regla, Firebase rechaza leerla y escribirla.
- **La versión publicada comparte la misma base de datos.** Las reglas actuales solo agregan permisos para `behavior` y `movement_days` y suben la edad mínima del perfil a 18 años, así que no rompen la app publicada.
- **Antes de publicar** se pueden probar en la consola de Firebase: Firestore Database → Reglas → «Simulador de reglas».

## Pruebas

166 pruebas automáticas en `tests/`, que cubren el cálculo del ciclo, los modos de etapa y las alertas, la validación del perfil, los datos que se envían a la IA, el consentimiento, la exportación, el plan del día, Tu patrón propio, Tu patrón del mes, Hoy es un día difícil, el aviso Plus, el catálogo y la selección de movimiento, la exportación y el borrado tolerantes, y las rutas del servidor.

No llaman a Claude ni a Firebase: la IA y el consentimiento se simulan. No gastan créditos ni tocan datos reales. El detalle, los errores que encontraron y la lista de revisión manual están en [docs/pruebas.md](docs/pruebas.md).

## Arquitectura

El navegador habla con Express. Express llama a Claude solo cuando la persona autorizó el asistente. El perfil, los registros, el chat y las actividades se leen y se escriben en Firestore con la sesión de Firebase de quien entró. El consentimiento y la exportación los escribe el servidor con ese mismo token.

| Capa | Dónde está | Qué hace |
|------|------------|----------|
| Navegador | `src/` | Pantallas, cálculo del ciclo, plan del día, Tu patrón propio y acceso a Firebase |
| Servidor | `server.ts`, `consentRoutes.ts`, `consentHttp.ts` | Sirve la app, las rutas de IA, el consentimiento, la exportación y las solicitudes de datos |
| Datos | Firebase | Auth y Cloud Firestore del proyecto `cyclia-mvp`. Cada documento cuelga de `users/{uid}` |
| IA | Claude Haiku 5.5 (`claude-haiku-5-5`, esfuerzo `low`) | Solo desde el servidor, con la clave del servidor y el consentimiento del asistente |

### Rutas del servidor

| Ruta | Qué hace | Requiere |
|------|----------|----------|
| `POST /api/analyze` | Análisis del registro de un día | Sesión y autorización del asistente |
| `POST /api/chat` | Chat Cyclia IA, con hasta 20 mensajes de historial | Sesión y autorización del asistente |
| `POST /api/plan-activity` | Propone cuánto tiempo dedicar a una actividad según la energía | Sesión y autorización del asistente. Sin clave, usa un cálculo local |
| `POST /api/behavior-pattern` | Tu patrón del mes: recibe los parámetros de comportamiento del mes (`actual`) y del anterior (`anterior`), y devuelve el patrón escrito por la IA | Sesión y autorización del asistente. Sin clave, responde `fuente: local` y la app arma el patrón sin IA |
| `POST /api/assist-activity` | Cyclia te asiste: recibe la conversación (`mensajes`, hasta 30) y la fecha de hoy (`hoy`). Devuelve una pregunta, o la actividad con pasos, esfuerzo, duración y, si ella los mencionó, día y hora | Sesión y autorización del asistente. Sin clave, usa una estimación local |
| `GET /api/consent/status`, `GET /api/consent/history`, `POST /api/consent/decisions` | Estado, historial y registro de las autorizaciones | Sesión |
| `POST /api/data-requests` | Solicitud de acceso, corrección o eliminación | Sesión |
| `GET /api/account/export` | Descarga un JSON con los datos de la cuenta | Sesión |

Si la IA se niega a responder una consulta, Cyclia contesta con un mensaje que sugiere consultar a un profesional. Si la clave falta o es inválida, el análisis y el chat responden "falta configurar la clave de la IA".

### Acceso

- **Correo y contraseña.** Un solo formulario, con contraseña de al menos 6 caracteres. Hay que marcar que se leyó la política. Si el correo no existe, Firebase crea la cuenta y Cyclia lo avisa. Si existe y la contraseña coincide, abre la sesión. Si la contraseña no coincide, no entra y no crea una cuenta duplicada.
- **Duración de la sesión.** La sesión vive en la pestaña del navegador donde se entró: sobrevive a una recarga, pero termina al cerrar la pestaña. Otra pestaña pide entrar de nuevo.
- **Contraseña olvidada.** «¿Olvidaste tu contraseña?» pide a Firebase un correo con un enlace. El mensaje no dice si ese correo tiene cuenta.
- **Administración.** No hay cuentas de administración dentro de la app. Las cuentas se ven, se bloquean o se borran en la consola de Firebase, en Authentication.

### Consentimiento

Al entrar, la persona decide sobre cuatro autorizaciones:

| Autorización | Obligatoria | Qué permite |
|--------------|-------------|-------------|
| Términos de uso (`terms`) | Sí | Usar la app |
| Política de privacidad (`privacy_notice`) | Sí | Declarar que la leyó |
| Datos de salud (`health_cycle`) | Sí | Guardar el ciclo, los registros y las estimaciones |
| Asistente de IA (`gemini_assistant`) | No | Enviar el perfil, los registros y los mensajes a Anthropic (Claude) para el análisis, el chat, la propuesta de duración y Cyclia te asiste. No autoriza entrenar modelos |

- El identificador de la autorización de IA sigue siendo `gemini_assistant` por compatibilidad con los registros guardados; el texto nombra a Anthropic (Claude).
- Cada decisión se guarda en `users/{uid}/consent_events` con la versión del texto (`CONSENT_VERSION` en `src/consentCopy.ts`, hoy `2026-11-borrador-2`). Si cambia el texto, la versión sube y todas las cuentas vuelven a decidir.
- Para cada autorización manda la decisión más reciente. Retirarla desde Perfil → Privacidad y datos apaga el análisis y el chat.

## Recorrido

1. **Bienvenida.** «Comencemos».
2. **Entrada.** Correo, contraseña y la casilla de la política.
3. **Consentimiento.** Las tres autorizaciones obligatorias y la opcional del asistente.
4. **Cuenta nueva.** Región (Chile o Perú) y objetivos (salud, productividad, autoconocimiento y bienestar), que quedan en el navegador (`cyclia_region`, `cyclia_objectives`). Después, el perfil.
5. **Perfil.** Nombre, fecha de nacimiento, peso, estatura, correo opcional, última menstruación, duración del sangrado y del ciclo, anticonceptivo, situación y condiciones. Se valida y se guarda en `users/{uid}`.
6. **Uso diario.** Las siete pestañas leen ese perfil y agregan registros, actividades o mensajes.

## Pestañas

| Pestaña | Qué muestra | Datos |
|---------|-------------|-------|
| Inicio | Saludo, anillo del día, la fase estimada y sugerencias de comida y bienestar. Desde aquí se abre el chat Cyclia IA | Perfil, `period_records`, registro del día |
| Ciclo | Calendario, día seleccionado, próxima regla, alertas, «Tus registros y la proyección», **Tu patrón propio**, Evolución de bienestar (7 días) y Proyección de 3 ciclos | Perfil, `period_records`, `daily_logs` |
| Fases | Conocimiento por fase. El porcentaje aparece solo con al menos dos registros en esa fase | Perfil, `period_records`, `daily_logs` |
| Bienestar | Guía de movimiento, nutrición y mente por fase. Lo marcado se guarda en el navegador | Perfil, `period_records` |
| Registro | ¿Cómo estás hoy?: ánimo, energía, cuerpo, números y notas. Al guardar, ofrece el análisis con IA | `daily_logs` |
| Organiza tu día | Semana, actividades del día, **Cyclia te asiste**, **Hoy es un día difícil** y crear actividad | `activities` |
| Perfil | Cuenta, ciclo, objetivos, privacidad, recordatorios, exportación y solicitudes de datos | Perfil, `consent_events`, `data_requests` |

## Funciones principales

### Ciclo y modos de etapa

El cálculo está en `src/utils/cycle.ts` y `src/utils/cycleModel.ts`. Cyclia no mide hormonas: la fase es una estimación a partir de la fecha de la regla y de la duración del ciclo.

- **Duración del ciclo.** Se usa la declarada (21 a 45 días, o 28 si dice «no sé») hasta tener tres ciclos completos dentro de ese rango; después, el promedio de los últimos seis.
- **Fases en un ciclo de 28 días con regla de 5:** días 1–5 menstrual, 6–12 folicular, 13–15 ovulatoria y 16–28 lútea. La ovulación se estima 14 días antes de la próxima regla.
- **Modos:**

| Modo | Cuándo | Qué cambia |
|------|--------|------------|
| Natural | Sin anticoncepción hormonal ni situación especial | Muestra fases y predice la regla |
| Hormonal | Pastilla, DIU hormonal, implante, inyección, anillo o parche | No calcula ovulación ni fases |
| Pausa | Embarazo, posparto o lactancia | Predicciones en pausa |
| Perimenopausia | Activada por la persona, terapia hormonal, o desde los 40 años con 60 días sin regla | Sin fases. Desde los 40 se ofrece activarla si hay variaciones |
| Menopausia | «Ya no tengo regla» o un año sin regla | Deja de predecir. Cualquier sangrado genera una alerta |

- **Alertas:** sangrado después de la menopausia, sangrado muy abundante o de más de 8 días, sangrado entre reglas en dos ciclos, tres ciclos seguidos de menos de 24 días, 90 días sin regla antes de los 45, dolor fuerte en las tres últimas reglas y retraso de 7 días o más con ciclos regulares.
- **Bochornos y sudores nocturnos** aparecen en el registro desde los 40 años o en perimenopausia y menopausia.

### Tu patrón propio

En la pestaña Ciclo (`src/utils/ownPattern.ts` y `src/components/OwnPatternCard.tsx`). Muestra lo que dicen sus propios registros sobre ciclo, sueño y energía.

- Aparece después de **14 días** desde el primer registro y con **al menos 10 registros con energía**. Antes, dice cuánto falta.
- Compara la energía de los días con sueño corto o malo con la de los días de buen sueño, y la energía entre fases (solo si el modo muestra fases).
- Cada hallazgo necesita al menos 4 registros por grupo y una diferencia de 0,7 o más en la escala de 1 a 5, y dice cuántos registros lo respaldan.
- Si nada cumple, dice que todavía no aparece un patrón claro. No usa IA y no envía datos fuera de la app.

### Organiza tu día

Pestaña principal de actividades (`src/components/plan/`). Cada actividad tiene fecha, horario, esfuerzo, importancia, fecha límite, pasos y estado (pendiente, en curso, hecha o no realizada).

- **Crear actividad.** Al elegir el horario, Cyclia propone cuánto tiempo dedicarle según la energía de hoy (`POST /api/plan-activity`). La fase solo se menciona como algo que «muchas mujeres reportan»; no cambia la duración.
- **Cyclia te asiste** (`CycliaTeAsiste.tsx`, `src/plan/assist.ts`). Es un chat con la IA:
  - Ella describe la actividad. Si el alcance no está claro, Cyclia hace una pregunta a la vez. La IA recibe toda la conversación, así que no olvida lo que ella ya respondió.
  - Cuando la información alcanza, Cyclia muestra la actividad propuesta: nombre, descripción, 2 a 5 pasos, esfuerzo con su motivo y duración estimada. Si ella mencionó día u hora («el jueves a las 15:00»), se usan; si no, se propone el primer horario libre.
  - Ella puede editar todo o seguir escribiendo para pedir cambios. **Guardar en mi día** crea la actividad en ese día, a esa hora y con la duración propuesta.
  - La conversación se guarda con la actividad (campo `assistChat`) y se ve al revisarla. Mientras no se guarda, queda en el navegador (`cyclia_asiste_borrador_` más el id de la cuenta) y vuelve al abrir el panel; «Empezar de nuevo» la borra.
- **Cada actividad tiene tres botones de ícono** (`ActivityItem.tsx`, íconos de `lucide-react`):
  - **Tachar** (círculo azul con check): la marca como hecha y la tacha; otro toque la destacha. Si pasó la hora sin marcarla, el círculo se pone rosado y dice «Pasó la hora. ¿La hiciste?».
  - **Editar** (lápiz, fondo amarillo): abre la actividad para cambiar nombre, descripción, día, hora y duración, y muestra la conversación con Cyclia si la tiene.
  - **Eliminar** (papelera, fondo rosado): pide confirmación, la borra y ofrece **Deshacer** durante 6 segundos, que la recupera con sus pasos y su conversación.
- **Hoy es un día difícil** (`src/plan/difficultDay.ts`, `DifficultDaySheet.tsx`). Con un toque reorganiza las actividades pendientes de hoy en tres grupos:
  - **Se mantiene:** vence hoy, es muy importante, es de cuidado o descanso, o dura 20 minutos o menos.
  - **Se acorta:** queda en el 60 % del tiempo, con nueva hora de término y los pasos que caben.
  - **Puede esperar:** poco importante, de esfuerzo alto o ya no realizada. Propone el día con menos carga y sin choque de horario en los próximos 7 días, nunca después de su fecha límite. Lo que depende de una tarea movida se mueve con ella.
  - Ella puede cambiar cada tarea de grupo. No se guarda nada hasta que aprueba, y se guarda todo o nada. Después puede **deshacer** el cambio completo durante el resto del día (la copia queda en el navegador). No usa IA.

### Análisis del día y Cyclia IA

El contexto que recibe la IA se arma en `src/utils/analysisContext.ts`.

| Se envía | No se envía |
|----------|-------------|
| Duración del ciclo y de la regla, día y fase (solo si el modo muestra fases) | Nombre, correo, fecha de nacimiento, peso y estatura |
| Método hormonal, situación y condiciones (celiaquía, diabetes, obesidad, depresión) | Una fase cuando el modo no la muestra |
| El registro del día y hasta cuatro días anteriores | Registros de días posteriores al analizado |

- Escalas de 1 a 5. En energía y concentración, 5 es mucho. En calidad de sueño, cansancio, ánimo, estrés y dolor, 5 es peor.
- Si el detalle del sueño trae horas («7 horas», «6,5 hrs», «5h»), ese número es el dato de sueño: menos de 7 puede explicar una energía baja; entre 7 y 9 no explica el cansancio por dormir poco.
- Clara de huevo se guarda como descripción: Cyclia no calcula fertilidad. Inquieta no es energía alta ni baja.
- Las reglas de la IA (`CYCLIA_SYSTEM_PROMPT` en `server.ts`) le prohíben diagnosticar, recetar o cambiar un tratamiento.
- El análisis queda en `daily_logs` (campo `aiAnalysis`) y el chat en `messages`.

### Evolución de bienestar

La gráfica usa los últimos 7 días. El comportamiento de cada día es el promedio de ánimo, estrés, dolor, sueño y cansancio: 1 es mejor y queda arriba; 5 es más difícil y queda abajo.

### Privacidad

Desde Perfil → Privacidad y datos se ven las autorizaciones y su historial, se pueden retirar, se descarga un JSON con los datos de la cuenta y se piden acceso, corrección o eliminación.

### Funciones Plus (activadas temporalmente)

Seis funciones son de pago (Cyclia Plus) y por ahora están activadas para todas las cuentas: **Hoy es un día difícil**, **Tu patrón propio**, **Tu patrón del mes**, **Cyclia te asiste**, **Análisis del día con IA** y **Chat Cyclia IA**. Llevan la etiqueta «PLUS».

- Antes de usar cada una aparece un aviso: «La opción que estás probando es de pago», con el nombre de la función y que está activada temporalmente. Ella toca **OK, seguir** y continúa.
- El aviso aparece una vez por función en cada sesión. Para que aparezca siempre, cambia `PLUS_NOTICE_REPEAT` a `'always'` en `src/plus/plusFeatures.ts`.
- La lista de funciones y los textos están en `src/plus/plusFeatures.ts`. La ventana está en `src/components/PlusNotice.tsx` (`usePlusNotice`, `PlusBadge`).
- Cuando exista el plan Plus, ese mismo punto es donde cada función revisará si la cuenta lo tiene.

### Foco «Salud física»: Tu movimiento de hoy

Si en «Elige tu foco» (o en Perfil → Objetivos) marcó **Salud física** (id `'salud'` en `cyclia_objectives`), Inicio cambia los «3 ejercicios» de `suggestCare` por la tarjeta **Tu movimiento de hoy** (`src/components/MovementCard.tsx`). Los otros focos no cambian.

- **Catálogo:** 120 actividades en `src/catalog/catalogo-salud-fisica.csv` (N.º, actividad, fases sugeridas, intensidad, energía mínima, tipo, duración, lugar, equipo y cuidado). `npm run catalog:build` lo convierte en `src/catalog/movementCatalog.ts`, un arreglo tipado `MovementActivity[]`. «Todas» equivale a las cuatro fases. No se edita a mano: se cambia la hoja y se vuelve a generar.
- **Selección** (`src/utils/movementPicker.ts`, `pickMovement`), sin IA. Cada día propone 3 actividades, cada una con una frase de motivo. Las reglas, en orden:
  1. **Energía:** `energy` del registro; si no hay número, `energyFeel` (baja 2, estable 3, inquieta 3, radiante 4). Sin registro de hoy, 3 y nada de intensidad alta. Solo entran actividades con energía mínima menor o igual.
  2. **Síntomas:** cólicos medios o dolor de 3 o más, solo suaves. Dolor de cabeza: nada de intensidad alta.
  3. **Sueño:** menos de 6 horas (`readSleep`) baja la energía un punto.
  4. **Tiempo y recursos:** respeta el tiempo libre y el lugar y equipo disponibles, si se conocen. Hoy la app no guarda esos datos, así que no filtra por ellos.
  5. **Variedad:** no repite lo sugerido en los últimos 7 días ni lo que marcó «No me gusta». Las 3 son de tipos distintos, con prioridad para fuerza, cardio o movilidad si faltan en la semana.
  6. **Fase:** en modo natural, las actividades sugeridas para la fase de hoy pesan el triple en el sorteo. En los modos hormonal, perimenopausia, menopausia y pausa, la fase no se usa. Si el motivo menciona la fase, dice «muchas mujeres reportan».
  7. **Perimenopausia y menopausia:** asegura 2 de fuerza y 1 de equilibrio en la semana.
  8. **Azar reproducible:** semilla = uid + fecha. Las mismas 3 todo el día; otras al día siguiente. Lo ya mostrado hoy se mantiene mientras siga permitido.
  9. Si quedan menos de 3, relaja la variedad semanal, después los tipos distintos y después el tiempo. Nunca la energía, los síntomas ni la seguridad.
- **Seguridad:** con embarazo o posparto y lactancia no se muestra el catálogo: «Antes de retomar o cambiar tu actividad física, conversa con tu matrona o médico». Con una condición de salud marcada aparece «Si tienes dudas por tu condición de salud, consúltalo con tu profesional». El cuidado de cada actividad se muestra cuando existe.
- **Botones:** «La hice» la marca como hecha; «No me gusta» la cambia por otra y no vuelve a proponerla.
- **Datos:** cada día se guarda en `users/{uid}/movement_days/{fecha}`, con los ids sugeridos, hechos y rechazados. Se incluye en la exportación y se borra al eliminar la cuenta.

### Tu patrón del mes (comportamiento)

En la pestaña Ciclo (`src/utils/behavior.ts`, `src/components/BehaviorReportCard.tsx`, `src/plan/behaviorPrompt.ts`). Cyclia estudia el comportamiento de cada usuaria mes a mes.

- **Meses:** bloques de 30 días contados desde su primer registro. El primer patrón está disponible cuando pasa más de un mes, al empezar el segundo. Antes, la tarjeta dice cuántos días faltan.
- **Parámetros de comportamiento de cada mes:**
  - días con registro y cobertura;
  - promedios de energía, ánimo, estrés, cansancio, dolor y sueño, y días de energía baja;
  - horas de sueño y energía tras sueño corto o bueno;
  - días de la semana con más y menos energía;
  - energía por fase (solo si su modo usa fases);
  - los 3 síntomas más frecuentes;
  - actividades planificadas y completadas, por esfuerzo y según la energía del día.
  Son solo cifras: no incluyen notas, nombre ni contacto.
- **La IA estudia los parámetros:** `POST /api/behavior-pattern` envía a Claude los parámetros del mes y, desde el segundo informe, los del mes anterior para comparar. Devuelve título, resumen, de 2 a 4 patrones con su respaldo y una sugerencia. Con menos de 10 registros en el mes no describe un patrón. Sin clave de IA o sin la autorización del asistente, Cyclia arma el patrón con las mismas cifras, sin IA.
- **Almacenamiento:** cada mes se guarda en `users/{uid}/behavior/mes-N`, con los parámetros y el informe. Los meses anteriores se ven en «Meses anteriores».
- **Aviso:** al cumplir cada mes aparece un aviso en la app («Ya cumpliste tu primer mes de registros…»), una vez por mes.
- Es una función Plus: antes de verlo aparece el aviso de opción de pago.

### Recordatorios

La preferencia de recordatorios del ciclo se guarda en el perfil (`cycleReminders`) y pide permiso de notificaciones al navegador. **El envío de los avisos todavía no está construido.**

## Datos en Firestore

Cada documento cuelga de `users/{uid}`, y solo esa persona lo lee o lo edita (`firestore.rules`). Las fechas se guardan como texto `AAAA-MM-DD`.

| Colección | Dónde | Qué guarda |
|-----------|-------|------------|
| Perfil | `users/{uid}` | Nombre, edad, nacimiento, ciclo, anticonceptivo, situación, modo perimenopausia, condiciones y recordatorios |
| `daily_logs` | `users/{uid}/daily_logs/{fecha}` | Escalas, sueño, fluido cervical, estado anímico, energía, sensaciones, manchado, síntomas, bochornos y el análisis |
| `period_records` | `users/{uid}/period_records/{id}` | Una regla: inicio, fin, volumen y dolor de 0 a 3 |
| `messages` | `users/{uid}/messages/{id}` | Chat con Cyclia: rol, texto y momento |
| `activities` | `users/{uid}/activities/{id}` | Actividad, fecha, horario, duración, esfuerzo, importancia, fecha límite, pasos, estado y, si se creó con Cyclia te asiste, la conversación (`assistChat`, hasta 40 mensajes) |
| `consent_events` | `users/{uid}/consent_events/{id}` | Cada decisión de consentimiento, con la versión del texto |
| `data_requests` | `users/{uid}/data_requests/{id}` | Solicitudes de acceso, corrección o eliminación |
| `movement_days` | `users/{uid}/movement_days/{fecha}` | Tu movimiento de hoy: `date`, `suggestedIds`, `doneIds`, `dislikedIds` y `updatedAt`. Solo la dueña lee y escribe |
| `behavior` | `users/{uid}/behavior/mes-{N}` | Parámetros de comportamiento de cada mes y el patrón que escribió Cyclia |
| `focus`, `day_plans` | `users/{uid}/...` | Datos de versiones anteriores (Mi Foco y el plan por minutos). La app actual ya no los escribe; se borran al eliminar la cuenta |

**Exportación y borrado de la cuenta:**
- `focus`, `behavior` y `movement_days` (y `day_plans` en el borrado) son **opcionales**. Si Firebase no permite leerlas, por ejemplo porque su regla aún no está publicada, la exportación las omite y lo indica en `omittedCollections` con una nota, y el borrado las salta y avisa en vez de fallar (`consentHttp.ts`, `src/utils/tolerantDelete.ts`).
- Las demás colecciones son obligatorias: si no se pueden leer, la exportación falla.
- `consent_events` y `data_requests` **nunca se borran**: se conservan como respaldo legal.
- El perfil `users/{uid}` se borra siempre al final.

### Validación del perfil

Las reglas están en `src/utils/profileFields.ts`, y `saveProfile` las vuelve a revisar antes de escribir.

| Campo | Regla | Campo en Firestore |
|-------|-------|--------------------|
| Nombre | Letras, espacios y guiones. Mínimo 2 letras, sin números | `name` |
| Fecha de nacimiento | Fecha real, no futura, con una edad de 18 a 100 años | `birthDate` |
| Edad | Años cumplidos, calculados con la fecha de nacimiento | `age` |
| Peso | Entre 30 y 250 kg | `weight` |
| Estatura | Entre 100 y 250 cm | `height` |
| Correo | Vacío o con formato de correo | `email` |
| Última menstruación | Fecha real, no futura | `lastPeriodDate` |
| Duración del sangrado | Entero de 1 a 10 días, o «no sé» (queda en 5) | `periodLength`, `periodLengthKnown` |
| Duración del ciclo | Entero de 21 a 45 días, o «no sé» (queda en 28) | `cycleLength`, `cycleLengthKnown` |
| Anticoncepción hormonal | Ninguna, pastilla, DIU hormonal, implante, inyección, anillo o parche | `hormonalMethod` |
| Situación | Ninguna, embarazo, posparto o lactancia, terapia hormonal, o ya no tengo regla | `specialSituation` |
| Modo perimenopausia | Apagado, ofrecido o activado por la persona | `perimenopauseMode` |
| Condiciones | Sí o no: celiaquía, diabetes, obesidad, depresión o ansiedad | `isCeliac`, `hasDiabetes`, `hasObesity`, `hasDepression` |

## Contenido del repositorio

| Ruta | Qué contiene |
|------|--------------|
| `src/` | La app: pantallas (`components/`), plan del día (`plan/`), cálculos (`utils/`), catálogo de movimiento (`catalog/`), acceso a Firebase (`firebase.ts`) y textos de consentimiento (`consentCopy.ts`) |
| `scripts/` | `build-catalog.mjs` (catálogo de movimiento) y `stage-vercel-public.mjs` (despliegue en Vercel) |
| `server.ts` | Servidor Express y rutas de IA |
| `consentRoutes.ts`, `consentHttp.ts` | Consentimiento, exportación y solicitudes de datos |
| `tests/` | Pruebas automáticas |
| `docs/` | Estado de las funciones, guía de la clave de Claude y guía de pruebas |
| `firestore.rules` | Quién puede leer y escribir cada documento |
| `public/` | Fondo floral |
| `design/` | Pantallas HTML para revisar el diseño sin levantar la app |

Hay componentes de versiones anteriores que ninguna pantalla usa (`OrganizaDia.tsx`, `AgendaScreen.tsx`, `FocusModule.tsx`, `src/focus/`, `src/utils/dayPlan.ts`, `src/utils/dayPlanStore.ts`). Se pueden borrar cuando se confirme que no se necesitan.

## Documentación adicional

- [docs/estado-funciones-cyclia.md](docs/estado-funciones-cyclia.md): qué funciones están construidas, cuáles faltan y el riesgo para la preventa.
- [docs/configurar-clave-claude.md](docs/configurar-clave-claude.md): cómo crear y configurar la clave de Claude, en local y en Vercel.
- [docs/pruebas.md](docs/pruebas.md): qué cubren las pruebas, los errores que encontraron y la revisión manual.
- [docs/analisis-aplicacion.md](docs/analisis-aplicacion.md): análisis completo de la app (seguridad, privacidad, calidad, riesgos) y el plan recomendado antes de la preventa.

## Estilo

- **Paleta:** Breezy Blue `#3A44C4`, Sunny Yellow `#F6E27F`, Flamingo Pink `#F49A9E`, Beach Blue `#A9C4F0`. Texto `#1B1F5E`.
- **Fondo:** celeste `#E3F1FB` con flores (`public/flores-fondo.svg`).
- **Botones:** la acción principal es rosada y la secundaria es amarilla.
- **Fases:** menstrual rosado, folicular celeste, ovulatoria amarillo, lútea azul.
- **Tipografías:** Josefin Sans para el nombre y los títulos, Nunito Sans para el texto.

## Referencia de diseño (`design/`)

`design/` guarda pantallas en HTML para revisar el diseño sin levantar la app. Se abre `design/index.html`. Los datos de ejemplo son la usuaria Valentina en el día 9 del ciclo. La app en marcha y los datos que realmente se guardan son los de `src/` y Firebase.
