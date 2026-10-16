# Cyclia

Cyclia es una aplicación de bienestar femenino que conecta el ciclo menstrual con la energía, la productividad y el bienestar diario. Calcula la fase del ciclo, guarda registros diarios y ofrece recomendaciones personalizadas con un asistente de IA.

> Cyclia es educativa y de bienestar: no diagnostica ni receta, y no reemplaza a un profesional de salud.

## Contenido del repositorio

| Ruta | Qué contiene |
|------|--------------|
| `src/` | Aplicación web (React + Vite + Tailwind) |
| `server.ts` | Servidor Express: sirve la app en `http://localhost:3001` y conecta con la API de Gemini |
| `supabase/` | Configuración de la base de datos (Supabase) |
| `design/` | Diseño visual de la app: pantallas HTML navegables, mapa de navegación y fuentes del diseño |

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

## Diseño de la app (`design/`)

Propuesta visual de CYCLIA con toda la navegación de primer y segundo nivel. Cada pantalla es un archivo HTML independiente: no requiere instalar nada.

**Cómo verlo:** abre `design/index.html` en el navegador. Desde ahí se accede a todas las pantallas, y dentro de cada una la barra inferior y los botones llevan a las demás, como en la app real.

### Estilo

- **Paleta:** Breezy Blue `#3A44C4`, Sunny Yellow `#F6E27F`, Flamingo Pink `#F49A9E`, Beach Blue `#A9C4F0`; texto `#1B1F5E`.
- **Fondo:** celeste claro `#E3F1FB` con flores tenues de colores (`design/flores-fondo.svg`). La pantalla de bienvenida usa un fondo botánico azul.
- **Botones:** acciones principales en rosado, secundarias en amarillo. Las opciones seleccionables se ven amarillo claro y pasan a rosado al elegirlas.
- **Colores por fase del ciclo:** menstrual rosado, folicular celeste, ovulatoria amarillo, lútea azul.
- **Tipografías:** Josefin Sans (logo y títulos) y Nunito Sans (texto), desde Google Fonts.

### Navegación

| Nivel 1 (barra inferior) | Nivel 2 (pantallas internas) |
|--------------------------|------------------------------|
| Bienvenida (`Main.html`) | — pantalla inicial |
| Inicio (`Inicio.html`) | Tu fase en detalle (`Inicio-Fase.html`), ¿Cómo te sientes? (`Humor.html`), Actividad recomendada (`Inicio-Actividad.html`) |
| Ciclo (`Ciclo.html`) | Detalle del día (`Ciclo-Dia.html`), Evolución de bienestar (`Ciclo-Evolucion.html`) |
| Registro (`Registro.html`) | Análisis de Cyclia (`Registro-Analisis.html`) |
| Cyclia IA (`Chat.html`) | Historial de conversaciones (`Chat-Historial.html`) |
| Perfil (`Perfil.html`) | Datos del ciclo y salud (`Perfil-Ciclo.html`), Objetivos (`Perfil-Objetivos.html`), Privacidad, notificaciones y modo oscuro (`Perfil-Privacidad.html`) |

`Mapa.html` muestra esta estructura completa con la paleta.

> La app en localhost sigue este diseño: barra de 5 pestañas (Inicio, Ciclo, Registro, Cyclia IA, Perfil). Humor, la fase y la actividad se abren desde Inicio.

### Archivos

- `design/*.html`: pantallas listas para abrir. Los datos (usuaria "Valentina", día 9 del ciclo) son de ejemplo.
- `design/cyclia-runtime.js`: motor mínimo, sin dependencias, que hace funcionar las pantallas (selecciones, pestañas, calendario).
- `design/flores-fondo.svg`: ilustración de fondo.
- `design/fuente/`: archivos originales del lienzo de diseño (`*.dc.html` y `canvas.json`), para seguir editándolo.
