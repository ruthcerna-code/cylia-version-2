# Configurar la clave de Claude (Anthropic) en Cyclia

Guardado el 17-11-2026. Cyclia usa **Claude Haiku 5.5** para el análisis del día, el chat, la propuesta de duración y Cyclia te asiste. Para que respondan, el servidor necesita la variable `ANTHROPIC_API_KEY`.

> No compartas la clave por chat, correo ni capturas de pantalla. Solo va en el archivo `.env` y en Vercel. Git ignora el `.env`, así que la clave no va a quedar en un commit.

## Parte 1 · Crear la clave en Anthropic

1. Entra a **https://platform.claude.com** y crea una cuenta o inicia sesión.
2. **Carga créditos.** Ve a **Settings → Billing**, agrega un medio de pago y compra créditos. Con Haiku 5.5, US$5 alcanzan para miles de pruebas.
   - Pon un **límite de gasto** mensual en **Settings → Limits**.
3. **Crea la clave.** Ve a **Settings → API Keys**, pulsa **Create Key** y ponle un nombre, por ejemplo `cyclia-local`.
4. **Cópiala de inmediato.** Empieza con `sk-ant-` y solo se muestra una vez. Si la pierdes, crea otra.

## Parte 2 · Pegarla en el computador

1. Abre la carpeta `C:\ProyectoPiloto\cylia-version-2` en VS Code o en el Explorador de archivos.
2. Abre el archivo **`.env`**, que está en la raíz, junto a `package.json`.
   - En el Explorador de Windows puede estar oculto: activa **Vista → Mostrar → Elementos ocultos** y ábrelo con el Bloc de notas.
3. Agrega esta línea al final, con tu clave real y sin espacios alrededor del `=`:

   ```
   ANTHROPIC_API_KEY=sk-ant-tu-clave-aqui
   ```

4. Puedes borrar la línea `GEMINI_API_KEY=...`, que ya no se usa.
5. Guarda el archivo (Ctrl + S).

## Parte 3 · Probar

1. Reinicia el servidor local: el `.env` solo se lee al arrancar. Si lo hace Claude Code, basta con avisarle "ya puse la clave".
2. Entra en http://localhost:3002 (o el puerto que indique el servidor). Vas a ver de nuevo la pantalla de consentimiento, porque el texto cambió a "Anthropic (Claude)". Acepta la autorización del asistente si quieres probar la IA.
3. Prueba:
   - **Análisis del día:** guarda un registro y pide el análisis.
   - **Chat Cyclia IA:** haz una pregunta sobre tu ciclo.
   - **Cyclia te asiste:** en Organiza tu día, describe una actividad. Si aparece "La clave de la IA del servidor no es válida", revisa el paso 2.

## Parte 4 · Producción (cuando vayas a publicar)

1. Crea una **segunda clave** en Anthropic, por ejemplo `cyclia-produccion`. Así, si una se filtra, puedes borrarla sin afectar a la otra.
2. En **vercel.com**, abre el proyecto y ve a **Settings → Environment Variables**.
3. Agrega `ANTHROPIC_API_KEY` con esa clave, marca **Production** (y Preview, si lo usas) y guarda.
4. Vuelve a publicar la app para que tome la variable.
5. Borra `GEMINI_API_KEY` si existe.

## Estado del trabajo al guardar esta guía

- Construidas en local, **sin commit**: "Tu patrón propio", "Hoy es un día difícil", la corrección del análisis manual, la corrección del servidor de desarrollo y el cambio de Gemini a Claude Haiku 5.5.
- El detalle está en `docs/estado-funciones-cyclia.md`.
