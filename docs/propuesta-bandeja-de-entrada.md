# Bandeja de entrada — Diagnóstico y propuesta técnica

Fecha: 18-11-2026 · Rama base: `agenda-actividades` (encima de `develop` + limpieza + Agenda).
Estado: **propuesta, sin código**. Requiere aprobación antes de los cambios estructurales.

> **Imágenes de referencia:** de las cinco imágenes que menciona el prompt, solo se recibió la de la Bandeja de entrada (la de «Sacar al perro» y «Generar documentación de la aplicación»). Las imágenes 2, 3 y 4 (Nueva tarea y Editar tarea) y la 5 (pantalla de Cyclia) no llegaron. Esta propuesta usa la descripción escrita del prompt y la identidad visual actual del código. Conviene adjuntar las imágenes 2 a 4 antes de diseñar los formularios.

---

## 1. Diagnóstico del proyecto

### Tecnologías (confirmadas en el repositorio)
- **Navegador:** React 19, Vite 6, Tailwind 4 y TypeScript en modo estricto. Una sola página de hasta 480 px, sin enrutador: la pestaña activa es el estado `appTab` de `src/App.tsx`.
- **Servidor:** Express (`server.ts`), desplegado en Vercel.
- **Datos:** Firebase Auth y Cloud Firestore (`cyclia-mvp`). El navegador lee y escribe directo con la sesión de la usuaria. Las reglas están en `firestore.rules`.
- **Íconos:** `lucide-react`.

### Navegación
- La barra inferior tiene **7 pestañas** en `grid-cols-7`: Inicio, Ciclo, Fases, Bienestar, Registro, Organiza tu día y Perfil.
- Agregar una octava deja cada botón en unos 60 px de ancho en un teléfono de 480 px. Es lo mínimo táctil (44 px), pero con textos en dos líneas muy apretados.

### Lo que ya existe y cubre gran parte del pedido
La pestaña **Organiza tu día** (`src/components/plan/`) ya es, en la práctica, una bandeja de entrada:

| Pedido del prompt | Ya existe | Dónde |
|-------------------|-----------|-------|
| Selector de semana y día, con hoy marcado | ✅ | `WeekStrip.tsx`: lunes a domingo con flechas, fase y conteo por día |
| Listado del día ordenado por hora | ✅ | `DayActivityList.tsx` |
| Agenda de todas las actividades | ✅ | `AgendaList.tsx` (vista Agenda, hecha hoy) |
| Crear actividad con nombre, fecha, hora y duración | ✅ (en hoja inferior, no en pantalla completa) | `CreateActivitySheet.tsx` |
| Hora de término calculada | ✅ | `endClock` en `src/plan/proposal.ts` |
| Aviso de choque de horario | ✅ | `overlappingActivity` en `src/utils/activities.ts` |
| Editar actividad | ✅ parcial: nombre, descripción, fecha, hora y duración | `ActivityReviewSheet` en `CycliaTeAsiste.tsx` |
| Tachar, editar y eliminar con confirmación y deshacer | ✅ | `ActivityItem.tsx`, `OrganizaTuDia.tsx` |
| Notas | ✅ (campo `notes`) | `ScheduledActivity` |
| Pasos de la actividad | ✅ parcial: `steps[]` sin marca de completado | `ActivityStep` en `src/types.ts` |
| Selector de mes | ❌ | — |
| Color por actividad | ❌ | — |
| Frecuencia o recurrencia | ❌ | — |
| Alertas | ❌ (existe `reminderMinutes`, siempre en `null`) | — |
| Subtareas que se completan | ❌ (`steps` no tiene `done`) | — |
| Formularios en pantalla completa | ❌ (hoy son hojas inferiores) | — |
| Estados «en curso» y «vencida» en la tarjeta | ⚠️ parcial (hoy: «Pasó la hora. ¿La hiciste?») | `ActivityItem.tsx` |

### Modelo de datos actual
Una sola colección: `users/{uid}/activities/{id}` (`ScheduledActivity` en `src/types.ts`), con:
- `title`, `date` (AAAA-MM-DD), `startTime` y `endTime` (HH:MM, hora local), `timeZone`, `estimateMinutes`;
- `notes`, `steps[]`, `effort`, `importance`, `deadline`, `planStatus` (pendiente, en curso, hecha o pospuesta), `completedAt`, `assistChat`, `reminderMinutes`.

Las reglas de `activities` validan título, fecha, horas, importancia y estado, y **aceptan campos adicionales**. Por eso se pueden agregar color, recurrencia, alertas y subtareas en el mismo documento, sin crear colecciones nuevas.

### Notificaciones
**No existe infraestructura.**
- No hay service worker, Firebase Cloud Messaging ni envío desde el servidor.
- Los recordatorios del ciclo solo guardan la preferencia y piden permiso al navegador.
- El proyecto de Firebase está en el **plan gratuito, sin facturación**, así que no puede usar Cloud Functions programadas.

### Fechas y zonas horarias
Las actividades guardan fecha y hora **locales** como texto, más la zona horaria de la usuaria. Funciona bien mientras ella no cambie de zona. Las alertas exactas sí necesitan calcular el instante real (UTC) con esa zona.

---

## 2. Arquitectura propuesta

**Recomendación: convertir «Organiza tu día» en «Bandeja de entrada»** en vez de agregar una octava pestaña y una segunda lista.

**Motivos:**
- El prompt pide no crear dos sistemas de actividades contradictorios (sección 10). Hoy ya existe uno completo.
- Se reutiliza todo lo construido: la semana, la lista, la Agenda, Cyclia te asiste, Hoy es un día difícil, tachar, eliminar y deshacer.
- La barra inferior no se aprieta más.

**Alternativa (si prefieres la octava pestaña):** agregar «Bandeja de entrada» como pestaña nueva que lee la misma colección `activities`, y dejar «Organiza tu día» para Cyclia te asiste y Día difícil. Así no hay datos duplicados, pero sí dos pantallas parecidas.

### Pantallas

| Pantalla | Cómo se construye |
|----------|-------------------|
| **Bandeja de entrada** | Evoluciona `OrganizaTuDia.tsx`: título «Bandeja de entrada», selector de **mes y año** con flechas, `WeekStrip` adaptado (día normal en lavanda, seleccionado en coral con borde azul marino, hoy siempre marcado), la lista del día con tarjetas que muestran franja de color, estado, duración, subtareas «3/6» y un ícono de recurrencia. Conserva Día / Agenda. Agrega un **botón flotante +** amarillo sobre la barra inferior |
| **Nueva tarea** | Pantalla completa nueva (`TaskEditorScreen.tsx`, modo crear). Incluye: nombre, «¿Cuándo?», hora con atajos de 15 minutos, duración (15, 30 y 45 min, 1 h, 1 h 30 y «Más…»), hora de término calculada y aviso de choque. Además, una sección **«Más opciones»** con color, frecuencia, alertas, subtareas y notas. Botón fijo **«Crear tarea»**. Pregunta antes de descartar cambios |
| **Editar tarea** | La misma pantalla en modo editar, con todos los campos visibles y desplazamiento vertical. Botón fijo **«Actualizar tarea»**. En actividades que se repiten pregunta: «¿Solo esta vez o toda la serie?» |

Las pantallas completas se muestran **dentro** de la pestaña, como una vista a pantalla completa que tapa la barra inferior mientras está abierta, con la X para volver. No se agrega un enrutador nuevo.

La hoja actual de crear actividad (`CreateActivitySheet`) y la de revisar (`ActivityReviewSheet`) se reemplazan por la pantalla nueva. La propuesta de duración de Cyclia se conserva como sugerencia dentro de «Duración».

### Componentes

**Se reutilizan:**
- `WeekStrip`, `ActivityItem`, `AgendaList` y `DayActivityList`;
- `overlappingActivity` y `endClock` (cálculo de choques y hora de término);
- `toDraft`, `PlusNotice` y los colores de Cyclia (`#3A44C4`, `#F6E27F`, `#F49A9E`, `#A9C4F0`, `#1B1F5E` y el fondo `#E3F1FB`, que son los del código; los del prompt son aproximados).

**Nuevos:**
- `TaskEditorScreen.tsx`: crear y editar, en pantalla completa;
- `MonthPicker.tsx`: mes y año con flechas;
- `ColorPicker.tsx`: 8 colores circulares con anillo en el seleccionado;
- `RecurrenceField.tsx`: única vez, diario, semanal con días o mensual, y fecha final;
- `AlertList.tsx`: alertas con campana y X, y «+ Añadir una alerta» sin duplicados;
- `SubtaskList.tsx`: agregar, renombrar, completar, eliminar y ordenar;
- `FloatingAddButton.tsx`.

**Lógica pura con pruebas:**
- `src/plan/recurrence.ts`: expandir una serie a las fechas visibles, con excepciones;
- `src/plan/taskStatus.ts`: pendiente, en curso, vencida o hecha;
- `src/plan/alerts.ts`: calcular el instante de cada alerta con la zona horaria.

---

## 3. Cambios en el modelo de datos (sin colecciones nuevas)

Todo va en el mismo documento `users/{uid}/activities/{id}`, con campos **opcionales**. Las actividades que ya existen siguen funcionando igual.

| Campo nuevo | Tipo | Uso |
|-------------|------|-----|
| `color` | texto, una de 8 claves (`coral`, `naranjo`, `amarillo`, `verde`, `azulgris`, `lavanda`, `burdeo`, `azul`) | Franja de color en la tarjeta |
| `subtasks` | lista de `{ id, title, done, order }`, máximo 30 | Subtareas con progreso. Los `steps` de Cyclia te asiste se convierten en subtareas al abrirlos |
| `alerts` | lista de claves sin repetir: `inicio`, `fin`, `5`, `15`, `30`, `60` | Alertas configuradas |
| `recurrence` | `{ frequency: 'diaria' \| 'semanal' \| 'mensual', weekdays?: number[], until?: AAAA-MM-DD }` o `null` | Regla de repetición |
| `exceptions` | lista de fechas | Ocurrencias borradas o editadas por separado |
| `seriesId` y `occurrenceDate` | texto | Solo en una ocurrencia editada aparte («solo esta vez»), que se guarda como actividad propia ligada a su serie |

**Por qué no se generan registros por cada repetición:** la serie se guarda **una vez** y la app calcula las fechas al mostrarlas. Así no hay registros infinitos ni duplicados (sección 7.5 del prompt). Editar «solo esta vez» crea una excepción y una actividad aparte. Editar «toda la serie» cambia la regla.

**Reglas de Firestore:** se agregan validaciones opcionales para `color`, `alerts` (lista de hasta 6), `subtasks` (lista de hasta 30) y `recurrence` (mapa). **Hay que publicarlas**, como en el cambio anterior.

**Sin migraciones destructivas:** no se borran ni se renombran campos. `steps`, `notes` y `reminderMinutes` se mantienen.

---

## 4. Alertas y notificaciones: decisión necesaria

Guardar las alertas es sencillo. **Entregarlas de verdad** con el teléfono bloqueado o la app cerrada requiere infraestructura que hoy no existe. Opciones:

| Opción | Qué hace | Funciona con la app cerrada | Costo y trabajo |
|--------|----------|------------------------------|-----------------|
| **A. Solo guardar las alertas** | Se configuran y se ven en la tarea, pero no avisan | ❌ | Bajo. Se indica en la app «Las alertas todavía no envían avisos» |
| **B. Avisos con la app abierta** | El navegador muestra la notificación mientras Cyclia está abierta en alguna pestaña | ❌ | Bajo-medio. Poco confiable en un teléfono |
| **C. Avisos reales (push)** | Service worker + Firebase Cloud Messaging + una tarea programada en Vercel (Vercel Cron) que revisa cada minuto qué alertas vencen y las envía desde el servidor | ✅ (en iPhone, solo si Cyclia se instala en la pantalla de inicio) | Alto. Necesita una cuenta de servicio de Firebase en el servidor y guardar el token de cada teléfono |

**Recomendación:** implementar **A** ahora, para que el formulario quede completo y honesto, y planificar **C** como etapa propia. La opción C también resuelve los recordatorios del ciclo, que hoy tampoco avisan.

---

## 5. Flujo de navegación

```
Bandeja de entrada (día seleccionado)
 ├─ +  ───────────────▶ Nueva tarea (pantalla completa, fecha = día seleccionado)
 │                        └─ Crear tarea ──▶ vuelve a la Bandeja en ese día
 ├─ tocar una tarjeta ─▶ Editar tarea (pantalla completa)
 │                        ├─ ¿Solo esta vez o toda la serie? (si se repite)
 │                        └─ Actualizar tarea ──▶ vuelve a la Bandeja en el mismo día
 ├─ Día / Agenda
 └─ Mes ◀ ▶  ·  Semana ◀ ▶  ·  Día
```

El día seleccionado se conserva al volver. La X pide confirmación si hay cambios sin guardar.

---

## 6. Riesgos técnicos

| Riesgo | Cómo se controla |
|--------|------------------|
| Recurrencias: la lógica más delicada, por fechas, excepciones y meses cortos (por ejemplo, el 31 en febrero) | Lógica pura con pruebas propias. Los meses sin ese día se saltan |
| «Hoy es un día difícil», Tu patrón y Cyclia te asiste leen `activities` y no conocen las repeticiones | En la primera versión trabajan con las actividades reales; las repeticiones virtuales se suman después. Se documenta |
| Reemplazar las hojas de crear y editar puede romper Cyclia te asiste (que crea actividades) | Cyclia te asiste sigue guardando igual. Solo cambia el formulario manual |
| Reglas de Firestore nuevas sin publicar: el guardado falla | Se publican en el mismo paso, con tu autorización |
| Zona horaria: viajes o cambio de hora | Fecha y hora siguen siendo locales. Las alertas (opción C) se calculan con `timeZone` |
| Barra inferior más apretada (si se elige la octava pestaña) | Con la recomendación de reutilizar «Organiza tu día» no cambia |
| Tamaño de la app (ya pesa 1,37 MB) | Las pantallas nuevas se cargan solo al abrirlas (`import()` dinámico) |

---

## 7. Plan de implementación

| Etapa | Contenido | Commit |
|-------|-----------|--------|
| 1 | Modelo: tipos, lectura y escritura de `color`, `subtasks`, `alerts`, `recurrence` y `exceptions`, más reglas de Firestore. Con pruebas | Uno |
| 2 | Bandeja de entrada: título, selector de mes, colores de la semana, tarjetas con color, estado y subtareas, botón + | Uno |
| 3 | Pantalla Nueva tarea: campos principales y «Más opciones» | Uno |
| 4 | Pantalla Editar tarea: color, frecuencia, alertas (opción A), subtareas y notas | Uno |
| 5 | Recurrencias en la Bandeja y la Agenda: «solo esta vez» o «toda la serie» | Uno |
| 6 | Pruebas de la sección 14, revisión en el navegador en tamaño de celular, README | Uno |
| 7 | Publicar las reglas de Firestore (con tu autorización) | — |
| (después) | Opción C de alertas: avisos reales | Proyecto aparte |

No se despliega a producción: todo queda en una rama, como hasta ahora.

---

## 8. Decisiones que necesito antes de empezar

1. **¿Convierto «Organiza tu día» en «Bandeja de entrada»?** (recomendado) ¿O agrego una octava pestaña?
2. **¿Alertas opción A ahora y C después?** (recomendado) ¿O B, o C desde ya?
3. **¿Recurrencias en esta entrega**, o primero todo lo demás y las recurrencias en una segunda entrega?
4. **¿Puedes adjuntar las imágenes 2, 3 y 4** de los formularios?
