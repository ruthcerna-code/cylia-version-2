# Estado real de las funciones de Cyclia

Revisión del código el 17-11-2026, contrastada con la tabla «Funcionalidades de CYCLIA» (plan, estado y etapa).

La columna **En la tabla** es lo que dice la hoja. La columna **En el código** es lo que hace la app que se ve. «Funciona» significa que el comportamiento descrito está en una pantalla que se abre. «Parcial» significa que hay una parte, pero no cumple lo que dice la fila. «No está» significa que no hay pantalla ni flujo que lo haga.

No existe cobro ni restricción de plan. Las funciones Plus se pueden usar en cualquier cuenta. Antes de usarlas, la app muestra un aviso de que son de pago y espera un OK de esa sesión (`src/plus/plusFeatures.ts`).

## Resumen

| | En la tabla | En el código |
|---|---|---|
| Funcionan como dice la fila | 11 marcadas «Implementado» | 10 funcionan. El plan del día básico ordena desde el 18-11-2026 («Tu foco de hoy»). |
| La tabla dice pendiente y ya están hechas | Hoy es un día difícil, Tu patrón propio | Las dos están en pantalla. |
| Siguen sin estar | Recordatorio, tendencia de 30 días, informe PDF, agente, Calendar, preferencias, voz, WhatsApp, plan empresas | Igual, con matices abajo. |
| A medias | Etapa por edad, registro de bochornos, expansión a Perú | Hay una parte visible, no el comportamiento completo. |

## Plan gratis

| Funcionalidad | En la tabla | En el código | Qué hay |
|---|---|---|---|
| Cuenta, consentimiento y edad mínima | Implementado | **Funciona** | Correo y contraseña, casilla de la política, consentimiento versionado y rechazo si la edad calculada es menor de 18 (`src/utils/profileFields.ts`). Las reglas de Firestore también exigen edad de 18 a 100. |
| Perfil del ciclo | Implementado | **Funciona** | Fecha de la última regla, duración del ciclo y del sangrado, método anticonceptivo, situación y condiciones. Se guarda en `users/{uid}`. |
| Registro diario | Implementado | **Funciona** | Cinco pasos en `DesignRegister.tsx`: ánimo, energía, cuerpo, números (energía, sueño, ánimo, síntomas) y una nota. |
| Calendario y fase estimada | Implementado | **Funciona** | Calendario con color de fase, próxima regla y proyección de 3 ciclos. En hormonal, pausa, perimenopausia y menopausia no inventa fases: deja de mostrarlas. |
| Modos de etapa | Implementado | **Funciona** | Hormonal, pausa, perimenopausia y menopausia en `src/utils/cycleModel.ts`. La perimenopausia no se enciende solo por cumplir 40: hace falta activarla, terapia hormonal, o 60 días sin regla desde los 40. |
| Etapa posible por edad | Pendiente | **Parcial** | En el perfil inicial, desde los 40 y sin otra situación, pregunta si los ciclos son irregulares. En Inicio, si además hay variación (dos saltos de ciclo o 60 días sin regla), ofrece activar perimenopausia. «Ahora no» la oculta 30 días. No pregunta en cada ingreso, y no hay tope a los 55 años. |
| Plan del día básico | Implementado | **Funciona** | En la Bandeja, vista Día de hoy, la tarjeta «Tu foco de hoy» (`DayFocusCard.tsx`, lógica en `src/plan/dayFocus.ts`) muestra hasta 3 actividades ordenadas por fecha límite, importancia y, con poca energía, lo liviano, cada una con su motivo. Calcula el tiempo libre hasta las 21:00 con 30 minutos de margen y separa «Puede esperar». El editor pide importancia y fecha límite opcional. No mueve nada por su cuenta. El fin del día es fijo (21:00). |
| Recordatorio diario | Pendiente | **No envía** | En Perfil hay interruptores («Recordatorio de registro» a las 20:00 y «Recordatorios del ciclo»). Guardan la preferencia. Ningún código crea un aviso, un service worker ni un envío. La propia pantalla de ajustes lo dice. |
| Evolución de 7 días | Implementado | **Funciona** | `SymptomChart.tsx`, en Ciclo. Gráfica de ánimo, estrés, dolor, sueño y cansancio de los últimos 7 días. |
| Registro de bochornos | Pendiente | **Parcial** | Desde los 40, o en perimenopausia y menopausia, el registro deja marcar «Bochornos» y «Sudores nocturnos» como sí o no. Cantidad e intensidad existen en el modelo (`hotFlashCount`, `hotFlashIntensity`, `nightSweatCount`, `nightSweatIntensity`) y se vuelven a guardar si ya estaban, pero ninguna pantalla los pide. |
| Privacidad y exportación | Implementado | **Funciona** | Consentimientos, retiro, historial, exportación JSON de la cuenta y solicitudes de acceso, corrección o eliminación. El archivo es JSON, no un informe clínico. |

## Plan Plus del MVP

| Funcionalidad | En la tabla | En el código | Qué hay |
|---|---|---|---|
| Hoy es un día difícil | Pendiente | **Funciona** | Botón en Organiza tu día. `replanDifficultDay` propone qué se mantiene, qué se acorta y qué puede esperar, con fecha. No guarda nada hasta aprobar, y se puede deshacer durante el día. No usa IA. La tabla todavía la marca pendiente. |
| Tu patrón propio | Pendiente | **Funciona** | Tarjeta en Ciclo. Mira los últimos 90 días. Pide al menos 14 días y 10 registros con energía. Compara sueño y ciclo con la energía. Si no alcanza, dice que todavía no hay patrón. No usa IA. La tabla todavía la marca pendiente. |
| Cyclia te asiste | Implementado | **Funciona, con condición** | Conversación que parte la actividad en pasos y estima esfuerzo y duración (`/api/assist-activity`). Exige sesión y autorización del asistente. Sin clave de Claude responde una estimación local, no la IA. |
| Análisis del día con IA | Implementado | **Funciona, con condición** | Al guardar el registro se puede pedir el comentario (`/api/analyze`). Exige sesión y autorización. Sin clave responde que falta configurarla. |
| Chat Cyclia IA | Implementado | **Funciona, con condición** | `ChatPanel.tsx` y `/api/chat`. El prompt prohíbe diagnosticar y recetar. El historial se guarda en la cuenta. Misma condición de clave y autorización. |

## Build y futuro

| Funcionalidad | En la tabla | En el código | Qué hay |
|---|---|---|---|
| Tendencia de 30 días | Pendiente | **No está** | No hay conteo semanal de bochornos ni intensidad promedio. La gráfica que existe es de bienestar y dura 7 días. |
| Informe para la consulta | Pendiente | **No está** | No hay PDF de 3 meses. La descarga de la cuenta es JSON. |
| Agente de planificación adaptativa | Propuesta | **No está** | Hay piezas sueltas: la propuesta de duración de una actividad explica el motivo y pide aceptar, y Hoy es un día difícil reorganiza con reglas fijas. Nadie aprende de las correcciones ni propone el día completo pidiendo permiso. |
| Conexión con Google Calendar | Propuesta | **Retirada** | Quedan el texto de consentimiento `google_calendar` y los campos `googleEventId` y `syncStatus`. No hay llamada a Calendar. Privacidad lo etiqueta como integración retirada. |
| Memoria de preferencias | Propuesta | **No está** | No hay lista en Perfil de lo que le sirve, ni se puede borrar. El selector de movimiento acepta preferencias, pero la pantalla le pasa vacío. |
| Registro por voz | Propuesta | **No está** | El dictado del navegador está en `FocusModule.tsx`, que ninguna pantalla abre. No graba una nota ni la convierte en registro. |
| Registro por WhatsApp | Propuesta | **No está** | No hay webhook, número ni flujo. |
| Plan empresas | Propuesta | **No está** | No hay cuentas de empresa ni vista de datos agregados. |
| Expansión a Perú | Propuesta | **Parcial** | Al crear la cuenta se elige Chile o Perú y queda en el navegador (`cyclia_region`). No cambia textos, precios, leyes ni el cálculo. No está en la configuración del perfil para cambiarla después. |

## Fuera de la tabla, y sí está

**Tu patrón del mes** (`BehaviorReportCard`, `/api/behavior-pattern`). Al cumplir un mes de registros, la IA escribe energía, sueño, ánimo y actividades. Sin clave, Cyclia arma el texto con las mismas cifras. No aparece en la hoja.

## Qué cambiar en la tabla

- Pasar a **Implementado**: Hoy es un día difícil, Tu patrón propio.
- Bajar a **Parcial**: Etapa posible por edad, Registro de bochornos, Expansión a Perú.
- Dejar **Pendiente** o **Propuesta**, como está: recordatorio, tendencia de 30 días, informe PDF, agente, Calendar, memoria de preferencias, voz, WhatsApp y plan empresas.
- El plan Plus sigue sin cobro: todas las cuentas ven las funciones Plus.
