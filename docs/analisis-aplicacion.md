# Análisis de la aplicación Cyclia

Fecha: 17-11-2026 · Rama `reenfoque-energia` · Incluye el trabajo del día, que todavía no está en commit.

## Resumen

**Cyclia funciona y la base es sólida.** El cálculo del ciclo, los modos de etapa, el registro diario y las funciones nuevas están construidos y probados (107 pruebas automáticas). La IA ya funciona con Claude Haiku 5.5. La privacidad está bien pensada: consentimiento por versiones, datos aislados por cuenta y nada de nombre ni correo hacia la IA.

**Antes de cobrar la preventa** hay que resolver cinco cosas:
1. Los textos legales tienen campos sin completar (`[PENDIENTE: responsable del tratamiento]`).
2. No existe el mecanismo de plan Plus (cobro y restricción).
3. Las rutas de IA no tienen límite de uso por cuenta.
4. La exportación de datos sale incompleta.
5. Las reglas de Firestore aceptan edades desde los 12 años, mientras la app exige 18.

| Área | Estado | Comentario |
|------|--------|------------|
| Funciones del plan gratis | 🟡 Incompleto | El recordatorio no avisa. El plan del día visible no ordena por plazo ni muestra «Puede esperar». Bochornos es sí/no, sin cantidad. La pregunta de perimenopausia no sale en cada ingreso. |
| Funciones Plus del MVP | 🟢 Completas en pantalla | Las 5 del MVP están construidas. No hay cobro: cualquier cuenta las usa. |
| Mecanismo de plan Plus | 🔴 No existe | Sin cobro ni restricción por función |
| Seguridad de datos | 🟡 Buena, con brechas | Reglas por cuenta. Faltan el límite de uso de la IA y la edad mínima en las reglas |
| Privacidad y aspectos legales | 🟡 En borrador | Consentimiento sólido, pero textos con campos pendientes y una exportación incompleta |
| Calidad del código | 🟡 Aceptable | Un archivo central muy grande y código sin uso |
| Pruebas | 🟢 Buenas en lógica | 107 pruebas. Faltan las pruebas de navegador con inicio de sesión |
| Despliegue y mantenimiento | 🟡 Mejorable | Sin integración continua ni linter. Dependencias con alertas de seguridad |

---

## 1. Qué tiene hoy la app

### Funciones

| Función | Estado | Dónde |
|---------|--------|-------|
| Seguimiento del ciclo, fases y proyección de 3 ciclos | ✅ | `src/utils/cycle.ts`, `cycleModel.ts` |
| Modos de etapa (natural, hormonal, pausa, perimenopausia, menopausia) y 8 alertas | ✅ | `src/utils/cycleModel.ts` |
| Registro diario en cinco pasos | ✅ | `DesignRegister.tsx` |
| Bochornos y sudores (cantidad e intensidad) | ⚠️ Solo sí o no | `DesignRegister.tsx`. Los campos de cantidad existen y ninguna pantalla los pide |
| Evolución de bienestar de 7 días | ✅ | `SymptomChart.tsx` |
| Fases y guía de bienestar | ✅ | `PhaseKnowledge.tsx`, `PhaseGuide.tsx` |
| Organiza tu día (lista por hora) | ✅ | `src/components/plan/OrganizaTuDia.tsx` |
| Orden del día por plazo, importancia, energía y «Puede esperar» | ⚠️ Código sin pantalla | `src/utils/dayPlan.ts`, `OrganizaDia.tsx` |
| Cyclia te asiste (chat que guarda la conversación) | ✅ | `CycliaTeAsiste.tsx`, `src/plan/assist.ts` |
| Hoy es un día difícil | ✅ | `src/plan/difficultDay.ts` |
| Tu patrón propio | ✅ | `src/utils/ownPattern.ts` |
| Análisis del día con IA | ✅ | `server.ts` `/api/analyze` |
| Chat Cyclia IA | ✅ | `ChatPanel.tsx`, `/api/chat` |
| Consentimiento, exportación y solicitudes de datos | ✅ (ver hallazgos) | `consentRoutes.ts`, `consentHttp.ts` |
| Recordatorios | ⚠️ Solo la preferencia, sin envío | `CyclePrivacySettings.tsx` |
| Plan Plus (cobro y restricción) | ❌ | — |
| Tendencia de 30 días, informe en PDF, Google Calendar, memoria de preferencias, voz, WhatsApp | ❌ Pendientes según la hoja de ruta | — |

### Arquitectura

- **Navegador:** React 19 + Vite 6 + Tailwind 4. Una sola página de hasta 480 px.
- **Servidor:** Express (`server.ts`), con 9 rutas `/api`.
- **Datos:** Firebase Auth + Firestore (`cyclia-mvp`). Cada documento cuelga de `users/{uid}`.
- **IA:** Claude Haiku 5.5, solo desde el servidor, con esfuerzo `low`. Cuesta cerca de US$0,0004 por llamada.
- **Tamaño:** unas 14.000 líneas en `src/`. El archivo más grande es `src/App.tsx`, con 1.761 líneas.

---

## 2. Hallazgos

Ordenados por importancia. 🔴 Alta: resolver antes de cobrar o de tener usuarias reales. 🟡 Media: resolver antes del lanzamiento. 🟢 Baja: mejora.

### 🔴 Alta

**A1. Los textos legales tienen campos sin completar.**
- `src/consentCopy.ts:43`: el consentimiento de datos de salud dice «Autorizo expresamente a **[PENDIENTE: responsable del tratamiento]**…».
- `src/components/ConsentScreen.tsx:68`: «[PENDIENTE: correo de contacto para privacidad]».
- `src/components/LegalDrafts.tsx:156-158`: faltan la identidad del servicio, la ley aplicable y las reglas de edad.
- **Riesgo:** un consentimiento expreso de datos de salud sin responsable identificado no es válido. Esto afecta a Chile, cuya nueva Ley 21.719 de protección de datos entra en vigencia en diciembre de 2026, y a Perú.
- **Qué hacer:** completar los textos con asesoría legal. Después, subir `CONSENT_VERSION` para que todas las cuentas vuelvan a aceptar.

**A2. No existe el mecanismo de plan Plus.**
- Hoy todas las cuentas ven todo. No hay pagos ni restricción por función.
- **Qué hacer:**
  - guardar el plan en el perfil, con escritura solo desde el servidor;
  - conectar un medio de pago;
  - bloquear las funciones Plus en la app y en el servidor.

**A3. Las rutas de IA no tienen límite de uso.**
- `server.ts`: `/api/analyze`, `/api/chat`, `/api/plan-activity` y `/api/assist-activity` solo piden sesión y consentimiento.
- Además, cualquier correo crea una cuenta al entrar (`src/firebase.ts:127`, sin verificar el correo).
- **Riesgo:** un script podría hacer miles de llamadas y gastar los créditos de Anthropic.
- **Qué hacer:**
  - poner un límite por cuenta, por ejemplo 60 llamadas por hora;
  - limitar el tamaño de `context` y `message`; hoy `express.json()` acepta hasta 100 KB;
  - poner un tope de gasto mensual en la Consola de Claude.

**A4. La exportación de datos sale incompleta.** ✅ Corregido el 17-11-2026: ahora incluye listas, objetos y todas las páginas.
- `consentHttp.ts:50-60` (`decodeDoc`) solo convierte textos, números, booleanos y nulos. **Las listas y los objetos se pierden:** síntomas del registro, pasos y conversación de las actividades.
- `consentHttp.ts:148` (`readCollection`) lee solo la primera página de cada colección y no sigue `nextPageToken`. Con muchos registros, el archivo puede quedar corto.
- **Riesgo:** el derecho de acceso a los datos no se cumple completo.
- **Qué hacer:** decodificar `arrayValue` y `mapValue`, y recorrer todas las páginas.

**A5. Las reglas de Firestore aceptan edades desde los 12 años.** ✅ Corregido en el código el 18-11-2026 (`age >= 18`); falta publicar las reglas.
- `firestore.rules:57`: `age >= 12`, pero la app exige 18 (`profileFields.ts`).
- **Riesgo:** alguien que escriba directo en Firestore podría guardar datos de salud de una menor.
- **Qué hacer:** cambiar a `age >= 18` y desplegar las reglas.

### 🟡 Media

**M1. El botón «Cargar una semana de ejemplo» mezcla datos falsos con los reales.**
- `SymptomChart.tsx:118` → `App.tsx:583` (`handleLoadDemoData`) escribe 15 días de registros inventados en la cuenta real.
- Esos registros alimentan Tu patrón propio y el análisis con IA.
- **Qué hacer:** quitarlo de producción, o mostrarlo solo en desarrollo.

**M2. «Eliminar» y «Restaurar datos» no hacen lo que dicen.**
- `App.tsx:1606` pregunta «¿Eliminar los datos de esta cuenta **en este dispositivo**?», pero `deleteAccountData` (`firebase.ts:419`) borra en Firebase.
- La cuenta de Firebase Auth sigue existiendo. Las decisiones de consentimiento y las solicitudes de datos se conservan, lo que es correcto como respaldo legal, pero no se informa.
- ✅ 18-11-2026: el texto ya no dice «en este dispositivo», explica que se conserva el historial de consentimientos, y el borrado ya no se corta si una colección opcional no se puede leer.
- **Qué hacer:**
  - corregir el texto (hecho);
  - ofrecer «Eliminar mi cuenta», que también borre el usuario de Firebase Auth;
  - explicar qué se conserva y por qué.

**M3. Los recordatorios no envían avisos.**
- La preferencia se guarda y se pide permiso de notificaciones, pero nada envía un aviso. Aparece como función del plan gratis.
- **Qué hacer:** construir el envío (notificaciones locales o Firebase Cloud Messaging) o quitar la opción hasta tenerlo.

**M4. Dependencias con alertas de seguridad.**
- En producción hay 10 alertas (9 altas, 1 moderada).
- Vienen de `firebase` (por `@grpc/grpc-js`), de `vite` y de `body-parser`/`qs` (por `express`).
- `vite` está en `dependencies` aunque solo se usa en desarrollo.
- **Qué hacer:**
  - actualizar `firebase` a 13.4 y correr `npm audit fix`;
  - mover `vite` y los plugins a `devDependencies`;
  - volver a correr las pruebas.

**M5. Cuentas creadas por error.**
- Si alguien escribe mal su correo, se crea una cuenta nueva sin aviso de verificación. Sus datos quedan repartidos en dos cuentas.
- **Qué hacer:** pedir confirmación antes de crear una cuenta nueva, y enviar verificación de correo.

**M6. La sesión dura solo lo que dura la pestaña.**
- `App.tsx:778` llama a `beginEntry(..., false)`: al cerrar la pestaña hay que volver a entrar.
- Para una app de uso diario en el teléfono esto es molesto.
- **Qué hacer:** ofrecer «Mantener la sesión iniciada».

**M7. Cada llamada de IA hace dos consultas extra.**
- `assertConsentFromRequest` valida el token con Google y lee el consentimiento en Firestore en cada llamada. Suma latencia.
- **Qué hacer:** guardar el resultado unos minutos por cuenta, o validar el token con Firebase Admin.

### 🟢 Baja

**B1. `src/App.tsx` tiene 1.761 líneas y 43 estados.**
- Mezcla la navegación, la carga de datos, el análisis, el chat y pantallas enteras. Cuesta mantenerlo y probarlo.
- Tiene un bloque oculto de unas 100 líneas que nunca se muestra (`App.tsx:1116`, `className="hidden"`).
- **Qué hacer:** separar por pestaña y mover la carga de datos a hooks.

**B2. Código sin uso.** ✅ Resuelto el 18-11-2026: se borraron los 7 archivos y las funciones que solo ellos usaban.
- Ninguna pantalla usa estos archivos: `OrganizaDia.tsx`, `AgendaScreen.tsx`, `FocusModule.tsx`, `src/focus/`, `src/utils/dayPlan.ts` y `dayPlanStore.ts` (unas 2.700 líneas).
- Firestore conserva reglas y datos para `day_plans` y `focus`, y existe el propósito de consentimiento `google_calendar` y el bloque `/credentials`.
- **Qué hacer:** borrarlos, conservando en Git lo que sirva de referencia.

**B3. El diseño está duplicado en el repositorio.** ✅ Resuelto el 18-11-2026: queda solo `design/`.
- `design/` y `cylia-version-2-diseno/` son casi iguales, y además está `cylia-version-2-diseno.zip`.
- **Qué hacer:** dejar solo `design/`.

**B4. El paquete de la app pesa 1,3 MB (357 KB comprimido).**
- Vite avisa que pasa de 500 KB. En un teléfono con mala conexión, la primera carga es lenta.
- **Qué hacer:** cargar con `import()` dinámico las pantallas que no se ven al inicio (chat, Fases, Bienestar, Perfil).

**B5. Faltan herramientas de calidad.**
- No hay linter, formateador ni integración continua.
- **Qué hacer:** agregar ESLint y una GitHub Action que corra `npm test` y `tsc` en cada pull request.

**B6. Las reglas de Firestore no limitan el tamaño de varios campos.**
- No hay límite para `notes`, `steps`, `assistChat` ni para los textos del registro.
- **Qué hacer:** poner topes razonables en las reglas.

**B7. Los nombres de las fases no son consistentes.**
- `PHASE_DETAILS` usa «Menstruación», «Fase Folicular», «Ovulación» y «Fase Lútea».
- Otras pantallas usan «Menstrual», «Folicular», «Ovulatoria» y «Lútea».
- **Qué hacer:** unificar en un solo lugar.

---

## 3. Lo que está bien

- **Privacidad desde el diseño:**
  - la IA no recibe nombre, correo, peso ni fecha de nacimiento;
  - el consentimiento de IA es opcional y se puede retirar;
  - cada decisión queda registrada con la versión del texto, y la versión vigente es la que manda.
- **Reglas de Firestore por cuenta:** cada persona solo lee y escribe lo suyo. El registro diario valida las escalas y las opciones.
- **Cuidado del lenguaje en salud:** la app habla de fases como estimación, dice «muchas mujeres reportan», no calcula fertilidad y alerta sin diagnosticar. La IA tiene prohibido diagnosticar o recetar, y lo cumple.
- **Respaldo sin IA:** la propuesta de duración y Cyclia te asiste funcionan aunque falte la clave. Tu patrón propio y Hoy es un día difícil no usan IA.
- **Pruebas:** 107 pruebas cubren la lógica crítica, y ya encontraron y corrigieron 4 errores reales.
- **IA barata y acotada:** Haiku 5.5 con esfuerzo bajo; las 4 tareas juntas costaron menos de medio centavo de dólar.

---

## 4. Plan recomendado

### Antes de la preventa (1 a 2 semanas)
1. Completar los textos legales y subir la versión del consentimiento (A1).
2. Límite de uso por cuenta en las rutas de IA y tope de gasto en Anthropic (A3).
3. Arreglar la exportación: listas, objetos y paginación (A4).
4. Edad mínima de 18 años en las reglas de Firestore, y desplegarlas (A5).
5. Quitar el botón de datos de ejemplo de producción (M1).
6. Construir el plan Plus: campo en el perfil, medio de pago y restricción (A2).
7. Hacer commit del trabajo actual y probar con cuentas reales (ver `docs/pruebas.md`).

### Antes del lanzamiento abierto
8. Eliminar cuenta completa y corregir los textos de borrado (M2).
9. Recordatorios que funcionen, o quitar la opción (M3).
10. Actualizar dependencias y mover `vite` a desarrollo (M4).
11. Confirmar la cuenta nueva, verificar el correo y ofrecer mantener la sesión (M5, M6).
12. Integración continua con pruebas y linter (B5).

### Mantenimiento
13. Dividir `App.tsx`, borrar el código sin uso y el diseño duplicado (B1, B2, B3).
14. Dividir el paquete para que la primera carga sea más rápida (B4).
15. Pruebas en navegador con el emulador de Firebase.

---

## 5. Cómo se hizo este análisis

- Revisión del código: `src/`, `server.ts`, `consentHttp.ts`, `consentRoutes.ts`, `firestore.rules` y la configuración de Vite y Vercel.
- `npm test`: 107 pruebas, todas pasan.
- `tsc --noEmit`: sin errores.
- `vite build`: compila; el paquete pesa 1,3 MB.
- `npm audit --omit=dev`: 10 alertas.
- Búsqueda de claves en el repositorio: no hay claves reales; `.env` está ignorado por Git.
- **No se revisó:** la configuración real de Firebase y de Vercel en sus consolas, el comportamiento en un teléfono real, ni el contenido de salud con un profesional clínico.
