# Auditoría del repositorio Cyclia

Fecha: 18-11-2026 · Rama `correccion-reglas-firestore` = `develop` en GitHub (`559dae8`) · 30 commits.

## Resumen

**El código está sano.** TypeScript compila sin errores, las 166 pruebas pasan, no hay claves en Git y el código de la app está bien separado entre pantallas, lógica y datos.

**Lo que más pesa** es el desorden acumulado de versiones anteriores, no los errores:
- unas **2.560 líneas de código que ninguna pantalla usa**, más unos 150 bloques ocultos en `App.tsx`;
- **dos carpetas de diseño** distintas y un `.zip`;
- **dos archivos de dependencias** (`bun.lock` y `package-lock.json`) que no coinciden;
- dos dependencias sin uso;
- archivos sueltos de la herramienta con que se creó el proyecto (`metadata.json`).

| Área | Estado |
|------|--------|
| Compilación (TypeScript) | 🟢 Sin errores. El modo estricto está apagado, pero activarlo solo da 3 errores |
| Pruebas | 🟢 166 pruebas en 9 archivos, todas pasan |
| Organización del código | 🟡 Buena en `utils/` y `plan/`; `App.tsx` es demasiado grande (1.803 líneas) |
| Código sin uso | 🟡 7 archivos (≈2.560 líneas) y bloques ocultos en `App.tsx` |
| Dependencias | 🟡 10 alertas de seguridad en producción; 2 paquetes sin uso; 2 lockfiles |
| Seguridad | 🟡 Sin claves en Git y reglas publicadas; falta límite de uso en las rutas de IA |
| Raíz del repositorio | 🟡 Mezcla código del servidor, diseño, archivos de otras herramientas y un `.zip` |

---

## 1. Estructura del repositorio

```
cylia-version-2/
├── src/                      ← LA APP (lo que ve la usuaria en el navegador)
│   ├── main.tsx              Punto de entrada: monta <App/> dentro del aviso Plus
│   ├── App.tsx               Componente principal: sesión, datos, pestañas y casi todas las pantallas (1.803 líneas)
│   ├── index.css             Estilos globales y Tailwind
│   ├── types.ts              Tipos compartidos: perfil, registro diario, actividad, regla, mensajes
│   ├── firebase.ts           Todo el acceso a Firebase: entrar, leer y guardar perfil, registros, actividades, chat, comportamiento y movimiento
│   ├── accountApi.ts         Entrada con correo y contraseña
│   ├── consentApi.ts         Llamadas al servidor para el consentimiento y el token de sesión
│   ├── consentCopy.ts        Textos legales del consentimiento y su versión
│   ├── dataExport.ts         Botón «Exportar mis datos»
│   ├── components/           Pantallas y tarjetas (27 archivos)
│   │   └── plan/             «Organiza tu día»: lista, fila de actividad, crear, Cyclia te asiste, día difícil (8 archivos)
│   ├── utils/                Cálculos sin pantalla: ciclo, modos y alertas, registros, patrones, movimiento, validaciones (14 archivos)
│   ├── plan/                 Lógica del plan del día y de la IA: propuesta de duración, Cyclia te asiste, día difícil, patrón del mes (5 archivos)
│   ├── catalog/              Catálogo de salud física: el CSV y movementCatalog.ts generado
│   ├── plus/                 Lista de funciones Plus y el aviso «es de pago»
│   └── focus/                ⚠️ «Mi Foco» de una versión anterior: no lo usa ninguna pantalla
│
├── server.ts                 SERVIDOR (Express): sirve la app y las rutas de IA con Claude
├── consentHttp.ts            Servidor: sesión, consentimiento, exportación (habla con Firestore por REST)
├── consentRoutes.ts          Servidor: rutas de consentimiento, exportación y solicitudes de datos
│
├── tests/                    PRUEBAS (Vitest): 9 archivos, 166 pruebas, sin Firebase ni IA reales
├── scripts/                  build-catalog.mjs (catálogo) y stage-vercel-public.mjs (despliegue en Vercel)
├── docs/                     Documentación: estado de funciones, análisis, pruebas, clave de Claude
├── public/                   Imagen de fondo de flores
│
├── firestore.rules           Reglas de seguridad de Firestore (publicadas en cyclia-mvp)
├── firestore.indexes.json    Índices de Firestore
├── firebase.json / .firebaserc  Configuración de Firebase CLI (proyecto cyclia-mvp)
│
├── index.html                Página HTML base que carga la app
├── vite.config.ts            Compilación de la app (Vite + React + Tailwind)
├── vitest.config.ts          Configuración de las pruebas
├── tsconfig.json             Configuración de TypeScript
├── package.json              Dependencias y comandos (dev, build, test, catalog:build)
├── package-lock.json         Versiones exactas de dependencias (npm) — el que se usa
├── bun.lock                  ⚠️ Lockfile de Bun de julio, desactualizado
│
├── design/                   Pantallas HTML del diseño, para revisar sin levantar la app
├── cylia-version-2-diseno/   ⚠️ Otra versión del diseño (distinta de design/)
├── cylia-version-2-diseno.zip ⚠️ La misma carpeta comprimida
├── metadata.json             ⚠️ Archivo de AI Studio que aún dice «Gemini»
├── security_spec.md          Nota corta sobre el acceso (desactualizada frente a firestore.rules)
├── README.md                 Documentación principal
├── .claude/launch.json       Cómo levanta el servidor local Claude Code
├── .env.example              Plantilla de variables de entorno
└── .gitignore / .vercelignore

No están en Git (los ignora .gitignore), pero existen en tu carpeta:
├── .env, .env.local          Claves (Claude, Firebase, Vercel). Nunca se suben
├── data/                     ⚠️ accounts.json y session-secret del sistema de cuentas antiguo; el código ya no los usa
├── dist/                     Resultado de `npm run build`
├── .vercel/                  Vínculo con el proyecto de Vercel
├── api/                      Carpeta vacía
└── entrega-tablero-oportunidad-a.html  Archivo suelto ignorado
```

### Cómo se conecta todo

```
Navegador (src/)  ──Firebase SDK──▶  Firebase Auth + Firestore (users/{uid}/...)
      │
      └──fetch /api/...──▶  Servidor (server.ts, consentRoutes.ts)
                                ├──▶ Claude Haiku 5.5 (análisis, chat, propuesta, te asiste, patrón del mes)
                                └──▶ Firestore REST con el token de la usuaria (consentimiento, exportación)
```

- **La app** lee y escribe directo en Firestore con la sesión de la usuaria. Las reglas de `firestore.rules` impiden que una cuenta vea los datos de otra.
- **El servidor** solo hace lo que no puede hacer el navegador: llamar a la IA con la clave secreta, revisar el consentimiento y armar la exportación.
- **La lógica pura** (`src/utils`, `src/plan`, `src/plus`, `src/catalog`) no depende de Firebase ni de la pantalla. Por eso se puede probar sin conexión.

### Tamaño

| Zona | Líneas |
|------|--------|
| `src/components/` (pantallas) | 6.653, de las que 1.789 no se usan |
| `src/components/plan/` | 1.695 |
| `src/utils/` | 2.730, de las que 277 no se usan |
| `src/plan/`, `src/plus/`, `src/catalog/` | 1.125 |
| `src/focus/` | 492, ninguna se usa |
| Raíz de `src/` (`App.tsx`, `firebase.ts`, etc.) | 2.863 |
| Servidor (`server.ts`, `consent*.ts`) | 860 |
| Pruebas | 1.593 |

### Ramas

| Rama | Commit | Estado |
|------|--------|--------|
| `develop` (local y GitHub) | `559dae8` | Al día con todo el trabajo |
| `correccion-reglas-firestore` | `559dae8` | Igual que develop; se puede borrar |
| `foco-salud-fisica` | `0404c88` | Ya está dentro de develop; se puede borrar |
| `reenfoque-energia` | `29e6bec` | Ya está dentro de develop; se puede borrar |
| `diseno-app-cyclia` | `914849d` | Rama antigua de diseño; revisar si sirve |
| `main` (local y GitHub) | `2593dd4` | 21 commits atrás de develop. Es lo que publica Vercel |

---

## 2. Hallazgos de la auditoría

### 🟡 Estructura y orden

**E1. Código sin uso: 7 archivos, ≈2.560 líneas.**
- **Archivos:** `src/components/AgendaScreen.tsx` (713), `src/components/FocusModule.tsx` (714), `src/components/OrganizaDia.tsx` (362), `src/focus/logic.ts` (418), `src/focus/store.ts` (76), `src/utils/dayPlan.ts` (219) y `src/utils/dayPlanStore.ts` (58).
- **Cómo lo comprobé:** seguí los imports desde `src/main.tsx` y `server.ts`, y ningún camino llega a ellos. La app no los descarga; solo confunden a quien lee el código.
- Junto con ellos quedan sin uso 5 funciones de `firebase.ts`: `loadFocusDoc`, `saveFocusDoc`, `deleteFocusDoc`, `loadDayPlan` y `saveDayPlan`.

**E2. Bloques que nunca se muestran en `App.tsx`.**
- Tres bloques `{false && …}` (líneas 988, 1003 y 1013: «Bienvenida a Cyclia», «Progreso diario» y «Hábitos de hoy»).
- Una columna con `className="hidden"` (línea 1150).
- En total son unas 150 líneas que sí viajan al teléfono, aunque nunca se ven.

**E3. `App.tsx` concentra demasiado: 1.803 líneas y 43 estados.**
- Mezcla la sesión, la carga de datos, el análisis con IA, el chat, la navegación y pantallas completas.
- Cada cambio pequeño obliga a tocar ese archivo, y es el más difícil de probar.

**E4. Diseño duplicado.**
- `design/` y `cylia-version-2-diseno/design/` tienen las mismas pantallas, pero **no son iguales**: hay dos versiones distintas.
- Además está el `.zip`. Queda poco claro cuál es la referencia vigente.

**E5. Archivos sueltos en la raíz.**
- `metadata.json` viene de AI Studio y todavía describe «Gemini».
- `security_spec.md` describe el acceso antiguo (perfil, registros y chat) y no menciona las colecciones nuevas.
- La carpeta `api/` está vacía.
- El código del servidor (`server.ts`, `consentHttp.ts`, `consentRoutes.ts`) vive suelto en la raíz, junto con la configuración.

**E6. Restos del sistema de cuentas antiguo.**
- `data/accounts.json` y `data/session-secret` siguen en tu carpeta. Git los ignora y ningún código los usa.
- Si tienen datos reales de cuentas, conviene borrarlos de tu computador o guardarlos en un lugar seguro.

### 🟡 Dependencias

**D1. 10 alertas de seguridad en las dependencias de producción** (9 altas y 1 moderada), y 13 si se cuentan las de desarrollo.
- Vienen de `firebase` (por `@grpc/grpc-js`), de `vite` y de `express` (`body-parser` y `qs`).
- La mayoría se resuelve actualizando `firebase` a 13.4 y corriendo `npm audit fix`.

**D2. Paquetes sin uso.**
- `motion`: ningún archivo lo importa.
- `autoprefixer`: Tailwind 4 ya no lo necesita y no hay `postcss.config`.

**D3. Paquetes de desarrollo en producción.** `vite`, `@vitejs/plugin-react` y `@tailwindcss/vite` están en `dependencies`, pero solo se usan para compilar.

**D4. Dos lockfiles que no coinciden.**
- `bun.lock` es de julio y no incluye `@anthropic-ai/sdk`.
- `package-lock.json` está al día.
- **Riesgo:** si Vercel o alguien instala con Bun, usaría versiones distintas. Hay que dejar solo `package-lock.json`.

### 🟡 Calidad del código

**C1. TypeScript sin modo estricto.**
- `tsconfig.json` no activa `strict`, así que TypeScript no avisa, por ejemplo, de valores que pueden faltar (`null` o `undefined`).
- Al activarlo aparecen **solo 3 errores**, todos en `App.tsx`. Es un arreglo barato con mucho beneficio.

**C2. 14 usos de `any`**, sobre todo en el servidor. Hoy no causan errores, pero esconden datos sin revisar.

**C3. Sin linter ni integración continua.** No hay ESLint ni una GitHub Action que corra `tsc` y `npm test` en cada cambio. Hoy las pruebas dependen de que alguien se acuerde de correrlas.

**C4. Textos legales pendientes.** Quedan 5 marcas `[PENDIENTE: …]` (responsable del tratamiento, contacto de privacidad, ley aplicable, edad y representación). Es el hallazgo A1 del análisis anterior.

### 🟡 Seguridad

**S1. Bien resuelto:**
- no hay claves en Git;
- `.env` y `data/` están ignorados;
- las reglas de Firestore aíslan cada cuenta y están publicadas (edad 18, `movement_days` y `behavior`);
- la IA nunca recibe nombre, correo ni peso.

**S2. Pendiente:** las rutas de IA no tienen límite de uso por cuenta, y `express.json()` acepta cuerpos de hasta 100 KB. Es el hallazgo A3 del análisis.

### 🟢 Pruebas

- **166 pruebas en 9 archivos:** ciclo, registros, plan, comportamiento, movimiento, Plus, exportación, borrado y servidor.
- Corren en unos 5 segundos y no llaman a Firebase ni a la IA.
- **Faltan:** pruebas en el navegador con inicio de sesión. Ver `docs/pruebas.md`.

---

## 3. Plan de orden recomendado

Todo esto es limpieza y no cambia lo que ve la usuaria. Conviene hacerlo en una rama aparte, con un commit por paso.

| # | Paso | Esfuerzo | Riesgo |
|---|------|----------|--------|
| 1 | Borrar los 7 archivos sin uso y las 5 funciones de `firebase.ts` que solo ellos usan (E1) | Bajo | Muy bajo: ya se simuló, compila y las pruebas pasan |
| 2 | Quitar los bloques `{false && …}` y la columna oculta de `App.tsx` (E2) | Bajo | Bajo |
| 3 | Borrar `bun.lock`, `motion` y `autoprefixer`; mover `vite` y sus plugins a `devDependencies` (D2, D3, D4) | Bajo | Bajo |
| 4 | Activar `strict` en `tsconfig.json` y corregir los 3 errores (C1) | Bajo | Bajo |
| 5 | Actualizar `firebase` y correr `npm audit fix` (D1) | Bajo | Medio: hay que volver a probar la app |
| 6 | Elegir una sola carpeta de diseño, borrar la otra y el `.zip`, y actualizar o borrar `metadata.json` y `security_spec.md` (E4, E5) | Bajo | Ninguno |
| 7 | Mover el servidor a `server/` (`server/index.ts`, `server/consentHttp.ts`, `server/consentRoutes.ts`) | Medio | Medio: cambia rutas de import y quizá la configuración de Vercel |
| 8 | Dividir `App.tsx`: una pantalla por pestaña en `src/screens/` y la carga de datos en hooks (`src/hooks/`) (E3) | Alto | Medio |
| 9 | Agregar ESLint y una GitHub Action con `tsc` + `npm test` (C3) | Medio | Ninguno |
| 10 | Borrar las ramas ya integradas: `correccion-reglas-firestore`, `foco-salud-fisica` y `reenfoque-energia` | Bajo | Ninguno: su trabajo ya está en develop |

Los pasos 1 a 4 y el 6 se pueden hacer juntos en una tarde. Los pasos 7 y 8 conviene hacerlos con calma, porque tocan muchos archivos.

---

## Avance de la limpieza (18-11-2026, rama `limpieza-repositorio`)

| Paso | Estado | Commit |
|------|--------|--------|
| 1. Borrar el código sin uso | ✅ 7 archivos y 5 funciones de `firebase.ts` (2.585 líneas) | `ba5507a` |
| 2. Quitar las pantallas ocultas de `App.tsx` | ✅ 4 bloques, más `checkAlerts` y `handleReRegister` (165 líneas) | `c42464a` |
| 3. Un solo lockfile y dependencias | ✅ Sin `bun.lock`, `motion` ni `autoprefixer`; `vite` y sus plugins pasaron a desarrollo | `14256ac` |
| 4. Modo estricto de TypeScript | ✅ Activado. Encontró 2 llamadas que podían caerse sin perfil, ya corregidas | `b7a1868` |
| 6. Una sola carpeta de diseño | ✅ Queda `design/`; se borraron `cylia-version-2-diseno/`, su `.zip` y `metadata.json`; `security_spec.md` actualizado | Este paso |
| 5, 7, 8, 9 y 10 | Pendientes | — |

## 4. Cómo se hizo esta auditoría

- Recorrí todos los archivos que sigue Git y los que ignora.
- Seguí los imports desde `src/main.tsx` y `server.ts` para encontrar el código sin uso.
- Corrí `npx tsc --noEmit` (normal y con `--strict`), `npm test`, `npm audit --omit=dev` y `npm audit`.
- Busqué claves con patrones de Anthropic, Google y llaves privadas.
- Comparé `design/` con `cylia-version-2-diseno/design/` y `bun.lock` con `package-lock.json`.
- **No revisé:** la configuración de Vercel en su consola, el contenido de las pantallas de diseño, ni el comportamiento en un teléfono real.
