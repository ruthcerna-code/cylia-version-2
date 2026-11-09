# Cyclia

Cyclia es una app de teléfono para el bienestar femenino. Conecta el ciclo menstrual con la energía, la productividad y el bienestar diario. Calcula la fase del ciclo, guarda registros diarios y ofrece recomendaciones personalizadas con un asistente de IA.

La interfaz está hecha para la pantalla del celular: una sola columna, la barra de seis pestañas abajo y las imágenes ajustadas al ancho. No es un sitio web de escritorio ni una página del creador de sitios. Hoy se abre en el navegador del teléfono; todavía no es un paquete de App Store ni de Google Play.

> Cyclia es educativa y de bienestar: no diagnostica ni receta, y no reemplaza a un profesional de salud.

## Tecnologías

- **Interfaz:** React 19, Vite 6 y Tailwind 4.
- **Servidor:** Node.js y Express (`server.ts`). En local escucha en `http://localhost:3001`.
- **Datos y acceso:** Supabase. Se entra en modo anónimo o con un usuario creado por la administración.
- **Chat:** Gemini, llamado desde el servidor con `GEMINI_API_KEY`.

## Arquitectura

El navegador habla con Express. Express habla con Gemini cuando el asistente está autorizado. El perfil, los registros, el chat y las actividades se leen y se escriben en Supabase con la sesión de quien entró.

| Capa | Dónde está | Qué hace |
|------|------------|----------|
| Navegador | `src/` | React 19, Vite y Tailwind. Una columna de hasta 480 px. Seis pestañas: Inicio, Ciclo, Registro, Agendar, Cyclia IA y Perfil. |
| Servidor | `server.ts` | Node y Express, puerto 3001. Sirve la app y las APIs. No guarda el perfil ni los registros. |
| Cuentas | `accounts.ts`, `data/accounts.json` | Usuario, contraseña y rol. El archivo queda en el servidor y no se publica. |
| Datos | Supabase | Postgres y Auth. Cada fila cuelga de `auth.users`. |
| IA | `POST /api/analyze`, `POST /api/chat` | Gemini, con la clave del servidor. |
| Agenda | `scheduled_activities` | Las actividades se guardan en la base de Cyclia. |

### Acceso

No hay entrada con Gmail ni registro público.

- **Anónimo.** Supabase abre una sesión nueva. Los datos quedan en ese usuario.
- **Usuario.** Lo crea la administración. Al entrar, el servidor abre la sesión de Supabase ya vinculada a esa cuenta.
- **Administración.** La cuenta inicial es `administrador`, con rol admin. Desde Perfil crea y elimina usuarios. Esa cuenta no se puede borrar.

La contraseña se comprueba en el servidor. Supabase no guarda el usuario ni la contraseña de Cyclia: guarda un usuario anónimo vinculado, y con ese identificador se guardan el perfil y los registros.

### Modelo de datos

El esquema está en `supabase/schema.sql`. Las migraciones que lo crean están en `supabase/migrations/`. Todas las tablas están en `public` y, si se borra el usuario de Auth, sus filas se borran en cascada. Las fechas del ciclo y del registro se guardan como texto.

| Tabla | Clave | Relación | Qué guarda |
|-------|-------|----------|------------|
| `profiles` | `id` = `auth.users.id` | Una por persona | Nombre, edad, ciclo, anticonceptivo y condiciones de salud |
| `daily_logs` | `user_id` + `date` | Varias; una por día | Sueño, fatiga, dolor, estrés, ánimo y el análisis de la IA |
| `messages` | `id` | Varias | Chat con Cyclia: rol, texto y momento |
| `scheduled_activities` | `id` | Varias | Actividad, fecha, horario y notas, en la base de Cyclia |

Cada persona solo ve lo suyo. Row Level Security limita cada fila al `auth.uid()` de la sesión. Perfiles, registros y mensajes se publican en Realtime para refrescar la pantalla.

## Contenido del repositorio

El código está en GitHub: https://github.com/ruthcerna-code/cylia-version-2. Cyclia es una app de bienestar femenino y se ejecuta en local.

| Ruta | Qué contiene |
|------|--------------|
| `src/` | App (React + Vite + Tailwind), pensada para la pantalla del teléfono |
| `server.ts` | Servidor Express y Gemini |
| `accounts.ts` | Cuentas de la administración y su vínculo con Supabase |
| `data/accounts.json` | Usuarios, contraseñas y roles. No se publica |
| `public/` | Fondo floral de la app |
| `supabase/schema.sql` | Modelo de la base: tablas, claves y acceso por persona |
| `design/` | Diseño visual de la app: pantallas HTML navegables, mapa de navegación y fuentes del diseño |
| `package.json` | Dependencias y scripts (`dev`, `build`, `start`) |

## Ejecutar la aplicación

Requisitos: Node.js.

```bash
npm install
cp .env.example .env    # completa las variables
npm run dev             # http://localhost:3001
```

Variables de entorno (ver `.env.example`):

- `GEMINI_API_KEY`: clave para las llamadas a la API de Gemini (servidor).
- `APP_URL`: origen de la app. En local es `http://localhost:3001`.
- `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`: URL del proyecto y clave pública de Supabase (Project Settings → API).

Para ver la versión compilada en local: `npm run build` y luego `npm start`.

## Características de la app

La app ocupa el ancho del teléfono (hasta 480 px, centrada en una pantalla más ancha). El fondo de flores cubre toda la pantalla y se ajusta al tamaño. Las tarjetas van encima, en blanco, rosado o amarillo.

### Entrada

1. Bienvenida con fondo botánico azul, el nombre CYCLIA y los botones Comenzar y Ya tengo cuenta.
2. Región: Chile o Perú.
3. Objetivos: salud, productividad, autoconocimiento y bienestar.
4. Registro del perfil: nombre, ciclo, periodo y condiciones de salud.

Se puede entrar en modo anónimo o con un usuario creado en Administración de usuarios. La cuenta inicial de administración es `administrador`. En modo anónimo los datos quedan en esa sesión; con una cuenta creada por administración se conservan al volver a entrar. Las cláusulas de privacidad quedan visibles en Perfil.

### Barra inferior

Seis pestañas fijas: Inicio, Ciclo, Registro, Agendar, Cyclia IA y Perfil.

| Pestaña | Qué muestra | Se abre desde ahí |
|---------|-------------|-------------------|
| Inicio | Saludo, anillo del día de ciclo, energía de la fase, registro de hoy, chat, humor, actividad y los próximos días | Tu fase, ¿Cómo te sientes?, Actividad de hoy |
| Ciclo | Calendario del mes, colores por fase y el próximo periodo | Detalle del día y evolución de bienestar |
| Registro | Ánimo, estrés, dolor, sueño, cansancio, síntomas y notas del día | Análisis de Cyclia al guardar |
| Agendar | Actividades guardadas en la base de Cyclia | Alta y edición |
| Cyclia IA | Conversación con la asistente | Historial de conversaciones |
| Perfil | Inicial, duración del ciclo y accesos de la cuenta | Datos del ciclo y salud, Objetivos, Privacidad y, si es administración, Cuentas |

### Evolución

La gráfica de bienestar usa solo los últimos 7 días. El comportamiento de cada día es el promedio de ánimo, estrés, dolor, sueño y cansancio. En la escala, 1 es mejor y queda arriba; 5 es más difícil y queda abajo. La pantalla muestra el promedio de la semana, el mejor día y el promedio de cada dato.

### Estilo

- **Paleta:** Breezy Blue `#3A44C4`, Sunny Yellow `#F6E27F`, Flamingo Pink `#F49A9E`, Beach Blue `#A9C4F0`. Texto `#1B1F5E`.
- **Fondo:** celeste `#E3F1FB` con flores (`public/flores-fondo.svg`). La bienvenida usa un fondo botánico azul.
- **Botones:** la acción principal es rosada y la secundaria es amarilla. Una opción elegida pasa de amarillo claro a rosado.
- **Fases:** menstrual rosado, folicular celeste, ovulatoria amarillo, lútea azul.
- **Tipografías:** Josefin Sans para el nombre y los títulos, Nunito Sans para el texto.

## Referencia de diseño (`design/`)

`design/` guarda las mismas pantallas en HTML, para revisar el diseño sin levantar la app. Se abre `design/index.html`. Los datos de ejemplo son la usuaria Valentina y el día 9 del ciclo. `design/fuente/` conserva el lienzo original. La app en marcha es la que está en `src/`.
