# Pruebas de Cyclia

Creadas el 17-11-2026. **157 pruebas automáticas, todas pasan.**

## Cómo correrlas

```bash
npm test            # corre todo una vez
npm run test:watch  # vuelve a correr al guardar un archivo
```

- Herramientas: [Vitest](https://vitest.dev) para las pruebas y Supertest para las rutas del servidor. Configuración en `vitest.config.ts`.
- **No llaman a Claude ni a Firebase.** La IA y el consentimiento se simulan, así que las pruebas no gastan créditos, no necesitan internet ni clave, y no tocan datos reales.
- Datos de ejemplo compartidos en `tests/helpers.ts`: un perfil de 30 años, ciclo de 28 días, regla del 1 de noviembre de 2026.

## Qué cubren

| Archivo | Pruebas | Qué revisa |
|---|---|---|
| `tests/ciclo.test.ts` | 26 | Día del ciclo, fases, ovulación, proyección de 3 ciclos, cambio de año y de hora. Modos de etapa: natural, hormonal, embarazo/lactancia, perimenopausia (activada y por 60 días sin regla desde los 40), menopausia. Las 8 alertas de salud. Validación del perfil y edad mínima de 18 años. |
| `tests/registros.test.ts` | 16 | Lectura del sueño y la energía del registro. Qué datos se envían a la IA (**sin nombre, correo, peso ni fecha de nacimiento**). Días recientes del análisis. Energía para el plan. Consentimiento: obligatorias, opcional de IA, versión del texto, decisión más reciente, validación de lo que llega al servidor. |
| `tests/plan.test.ts` | 32 | Propuesta de duración, con y sin IA. Cyclia te asiste: de 2 a 5 pasos, esfuerzo, duración y la pregunta cuando falta un dato. Horarios: término pasada la medianoche, choques, hueco libre, no agendar en el pasado. **Tu patrón propio**: espera 2 semanas, cuenta los registros, dice "no hay patrón", no usa fases con anticoncepción hormonal. **Hoy es un día difícil**: mantener, acortar, mover sin choques ni pasar la fecha límite, dependencias, cambiar de grupo. |
| `tests/servidor.test.ts` | 27 | Las 4 rutas de IA: exigen la autorización del asistente, usan `claude-haiku-5-5` con esfuerzo bajo, envían las reglas de Cyclia, ordenan el historial del chat, reintentan cuando la IA no responde en formato, usan el respaldo local sin clave y responden mensajes claros ante una negativa o una clave inválida. Las rutas de cuenta exigen sesión. |

## Errores que encontraron las pruebas (ya corregidos)

1. **Consentimiento: no siempre mandaba la decisión más reciente** (`consentHttp.ts`, `summarizeConsent`). Firestore entrega las decisiones ordenadas por un identificador aleatorio, no por fecha. Si una usuaria retiraba la autorización de IA, podía seguir contando como aceptada, o al revés. Ahora se ordenan por fecha antes de decidir. También se pide una página de 300 decisiones, para que las recientes no queden fuera.
2. **Días anteriores a la última regla, corridos en un día** (`src/utils/cycle.ts`, `getCycleDay`). El día antes de la regla aparecía como día 27 en vez de 28. La fecha en que empezó el ciclo anterior aparecía como día 28 (lútea) en vez de día 1 (menstrual). Afectaba el calendario hacia atrás.
3. **El análisis con IA incluía días posteriores como "recientes"** (`src/utils/analysisContext.ts`). Al analizar un día pasado, la IA recibía registros de días que vinieron después. Ahora solo recibe días anteriores.
4. **Texto de "Tu patrón propio"** (`src/utils/ownPattern.ts`). Decía "en la fase Fase Folicular". Ahora dice "en la fase Folicular".

## Qué no cubren (revisar a mano)

Las pruebas automáticas no abren la app en un navegador ni usan Firebase de verdad. Esto se revisa a mano, con una cuenta de prueba:

- [ ] **Entrar y salir** con correo y contraseña; "¿Olvidaste tu contraseña?".
- [ ] **Consentimiento:** aparece al entrar; sin las 3 obligatorias no deja seguir; la de IA es opcional; retirarla en Privacidad y datos apaga el chat y el análisis.
- [ ] **Registro diario:** guardar, editar y ver el registro; los bochornos aparecen desde los 40 años o en perimenopausia y menopausia.
- [ ] **Calendario y proyección:** fases y próxima regla correctas; registrar el inicio de la regla hoy.
- [ ] **Organiza tu día:** crear, editar, marcar hecha o no realizada, deshacer; Cyclia te asiste; Hoy es un día difícil (aprobar y deshacer).
- [ ] **Chat y análisis** con la clave real: respuestas en español, sin diagnosticar ni recetar.
- [ ] **Exportar mis datos** y **solicitud de datos** en Privacidad.
- [ ] **Reglas de Firestore** (`firestore.rules`): una cuenta no puede leer los datos de otra.
- [ ] **Celular:** la app se ve bien a 375 px de ancho.

**Siguiente paso recomendado:** automatizar estos recorridos con pruebas en el navegador (por ejemplo Playwright), usando el emulador de Firebase y una cuenta de prueba, para no depender de datos reales.
