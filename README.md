# Cyclia

Cyclia es una app de teléfono para el bienestar femenino. Conecta el ciclo menstrual con la energía, la productividad y el bienestar diario. Calcula la fase del ciclo, guarda registros diarios y ofrece recomendaciones personalizadas con un asistente de IA.

La interfaz está hecha para la pantalla del celular: una sola columna, la barra de cinco pestañas abajo y las imágenes ajustadas al ancho. No es un sitio web de escritorio ni una página del creador de sitios. Hoy se abre en el navegador del teléfono; todavía no es un paquete de App Store ni de Google Play.

> Cyclia es educativa y de bienestar: no diagnostica ni receta, y no reemplaza a un profesional de salud.

## Tecnologías

- **Interfaz:** React 19, Vite 6 y Tailwind 4.
- **Servidor:** Node.js y Express (`server.ts`). En local escucha en `http://localhost:3001`.
- **Datos y acceso:** Supabase. Se entra con Gmail, o con correo y contraseña si el correo no es de Gmail.
- **Chat:** Gemini, llamado desde el servidor con `GEMINI_API_KEY`.

## Dónde está ahora

La aplicación corre en el computador de desarrollo (`npm run dev`). El código publicado está en GitHub, rama `main`: https://github.com/ruthcerna-code/cylia-version-2

`bitacoradigitalruth.es` no aloja Cyclia. Hoy muestra un sitio del creador de páginas de Hostinger.

Para publicarla hace falta un alojamiento que ejecute Node.js (`npm run build` y `npm start`) y estas variables: `GEMINI_API_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` y `APP_URL`. Un plan que solo sirva páginas HTML no alcanza. En Supabase hay que permitir la URL pública en las redirecciones de acceso.

## Contenido del repositorio

| Ruta | Qué contiene |
|------|--------------|
| `src/` | App (React + Vite + Tailwind), pensada para la pantalla del teléfono |
| `server.ts` | Servidor Express y conexión con Gemini |
| `public/` | Fondo floral de la app |
| `supabase/` | Esquema de la base de datos (Supabase) |
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
- `APP_URL`: URL donde se publica la app.
- `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`: URL del proyecto y clave pública de Supabase (Project Settings → API).

Para producción: `npm run build` y luego `npm start`.

## Características de la app

La app ocupa el ancho del teléfono (hasta 480 px, centrada en una pantalla más ancha). El fondo de flores cubre toda la pantalla y se ajusta al tamaño. Las tarjetas van encima, en blanco, rosado o amarillo.

### Entrada

1. Bienvenida con fondo botánico azul, el nombre CYCLIA y los botones Comenzar y Ya tengo cuenta.
2. Región: Chile o Perú.
3. Objetivos: salud, productividad, autoconocimiento y bienestar.
4. Registro del perfil: nombre, ciclo, periodo y condiciones de salud.

Para ver el ciclo, los registros y el historial hace falta entrar con Gmail, o con correo y contraseña si ese correo no es de Gmail. Una dirección `@gmail.com` entra solo con el botón de Gmail. Las cláusulas de privacidad quedan visibles en Inicio y en Perfil.

### Barra inferior

Cinco pestañas fijas: Inicio, Ciclo, Registro, Cyclia IA y Perfil.

| Pestaña | Qué muestra | Se abre desde ahí |
|---------|-------------|-------------------|
| Inicio | Saludo, anillo del día de ciclo, energía de la fase, registro de hoy, chat, humor, actividad y los próximos días | Tu fase, ¿Cómo te sientes?, Actividad de hoy |
| Ciclo | Calendario del mes, colores por fase y el próximo periodo | Detalle del día y evolución de bienestar |
| Registro | Ánimo, estrés, dolor, sueño, cansancio, síntomas y notas del día | Análisis de Cyclia al guardar |
| Cyclia IA | Conversación con la asistente | Historial de conversaciones |
| Perfil | Inicial, duración del ciclo y accesos de la cuenta | Datos del ciclo y salud, Objetivos, Privacidad y notificaciones |

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
