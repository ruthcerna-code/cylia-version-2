# Cyclia

Cyclia es una app de teléfono para el bienestar femenino. Conecta el ciclo menstrual con la energía, la productividad y el bienestar diario. Calcula la fase del ciclo, guarda registros diarios y ofrece recomendaciones con un asistente de IA.

La interfaz está hecha para la pantalla del celular: una sola columna, la barra de siete pestañas abajo y las imágenes ajustadas al ancho. Hoy se abre en el navegador. Todavía no es un paquete de Google Play. Publicarla en la tienda no exige Firebase.

> Cyclia es educativa y de bienestar: no diagnostica ni receta, y no reemplaza a un profesional de salud.

Repositorio: https://github.com/ruthcerna-code/cylia-version-2  
Rama de trabajo: `develop`.

## Tecnologías

- **Interfaz:** React 19, Vite 6 y Tailwind 4.
- **Servidor:** Node.js y Express (`server.ts`). En local escucha en `http://localhost:3001`.
- **Datos y acceso:** Firebase Auth y Cloud Firestore, en el proyecto `cyclia-mvp`. No hay Supabase.
- **Cuentas de Cyclia:** usuario y contraseña en `data/accounts.json`, en el servidor. Ese archivo no se publica.
- **Asistente:** Gemini, llamado desde el servidor con `GEMINI_API_KEY`, solo si la persona lo autorizó.

## Dónde vive cada dato

| Dato | Dónde se guarda | Cuándo entra |
|------|-----------------|--------------|
| Usuario, contraseña y rol | Firebase Auth, y la cuenta de administración en `data/accounts.json` | Al entrar. Si el correo no existe, Firebase crea la cuenta en ese momento |
| Sesión | Firebase Auth | En el mismo momento del acceso |
| Recordar 24 horas | Navegador, si se marca la casilla | Al entrar. Si no se marca, la sesión termina al cerrar el navegador |
| Política leída | `sessionStorage` y luego `users/{uid}/consent_events` | Antes de entrar y al continuar dentro de la app |
| Región y objetivos | Navegador (`cyclia_region`, `cyclia_objectives`) | Después del acceso, antes del perfil |
| Perfil de ciclo y salud | Firestore, documento `users/{uid}` | Al terminar el registro y al editar la ficha |
| Registro del día | Firestore, `users/{uid}/daily_logs/{fecha}` | En Registro. Además de las escalas, guarda fluido cervical, estado anímico, energía en palabras y el nivel de cabeza, hinchazón, sensibilidad mamaria y cólicos. Las horas de sueño van en el texto del sueño |
| Cada regla | Firestore, `users/{uid}/period_records` | Al guardar el perfil o marcar el inicio de una regla. Guarda inicio, fin, volumen y dolor |
| Chat | Firestore, `users/{uid}/messages` | En Cyclia IA |
| Actividades | Firestore, `users/{uid}/activities` | En Agendar, con hora, y en Organiza tu día, con o sin hora |
| Plan del día | Firestore, `users/{uid}/day_plans/{fecha}` | Minutos disponibles y, si el registro no tiene energía, la energía de hoy |
| Consentimientos y solicitudes | Firestore, `consent_events` y `data_requests` | Al aceptar, retirar o exportar |

Las fechas del ciclo y del registro se guardan como texto `AAAA-MM-DD`. Cada persona solo lee y escribe sus documentos: las reglas están en `firestore.rules`.

## Recorrido y datos que se piden

1. **Entrada.** Un solo formulario: usuario y contraseña. El usuario es el correo. Casilla opcional «Mantener la sesión por 24 horas». Hay que marcar la política. No hay botón «Sin cuenta».
2. **Cuenta nueva.** Si el correo no existe, se crea la cuenta y una ventana dice «Se creó una cuenta nueva». Después sigue el registro: región, objetivos y perfil.
3. **Cuenta existente.** Si el correo y la contraseña coinciden, una ventana dice «Mostraremos tu calendario» y al continuar se abre la app. Si la contraseña no coincide, no entra.
4. **Región.** Chile o Perú. Queda en el navegador.
5. **Objetivos.** Salud, productividad, autoconocimiento y bienestar. Quedan en el navegador.
6. **Perfil.** Nombre, fecha de nacimiento, edad calculada, peso, estatura, correo opcional, última menstruación, duración del sangrado, duración del ciclo, anticonceptivo y condiciones. Se valida y se escribe en `profiles`.
7. **Uso diario.** Inicio, Ciclo, Registro, Agendar, Cyclia IA, Organiza tu día y Perfil leen ese perfil y agregan registros, actividades o chat.

### Validación del perfil

La fecha de nacimiento va antes que la edad. La edad es el número entero de años cumplidos y no se escribe a mano. `saveProfile` vuelve a revisar todo antes de escribir en Firestore.

| Campo | Regla | Columna |
|-------|--------|---------|
| Nombre | Texto: letras, espacios y guiones. Mínimo 2 letras. Sin números | `name` |
| Fecha de nacimiento | Fecha real, no futura. Produce una edad de 12 a 100 años | `birth_date` |
| Edad | Número entero calculado con la fecha de nacimiento | `age` |
| Peso | Número entre 30 y 250 kg | `weight` |
| Estatura | Número entre 100 y 250 cm | `height` |
| Correo | Vacío o con formato de correo | `email` |
| Última menstruación | Fecha real y no futura | `last_period_date` |
| Duración del sangrado | Número entero de 1 a 10 días, o «no sé» (queda en 5) | `period_length`, `period_length_known` |
| Duración del ciclo | Número entero de 21 a 45 días, o «no sé» (queda en 28). Esa cifra arma la fase hasta que haya al menos tres ciclos completos dentro de ese rango; después se usa su promedio | `cycle_length`, `cycle_length_known` |
| Anticoncepción hormonal | Ninguna, pastilla, DIU hormonal, implante, inyección, anillo o parche | `hormonal_method` |
| Situación | Ninguna, embarazo, posparto o lactancia, terapia hormonal o ya no tengo regla | `special_situation` |
| Modo perimenopausia | Apagado, ofrecido o activado por la persona desde los 40 años | `perimenopause_mode` |
| Condiciones | Sí o no: celiaquía, diabetes, obesidad, depresión o ansiedad | `is_celiac`, `has_diabetes`, `has_obesity`, `has_depression` |

Las reglas están en `src/utils/profileFields.ts`. El registro y la ficha de salud las usan.

## Arquitectura

El navegador habla con Express. Express habla con Gemini cuando el asistente está autorizado. El perfil, los registros, el chat, las actividades y el plan del día se leen y se escriben en Firestore con la sesión de Firebase de quien entró. El consentimiento y la exportación los escribe el servidor con ese mismo token.

| Capa | Dónde está | Qué hace |
|------|------------|----------|
| Navegador | `src/` | React 19, Vite y Tailwind. Una columna de hasta 480 px. |
| Servidor | `server.ts` | Puerto 3001. Sirve la app, el acceso, el consentimiento, la exportación y Gemini. |
| Cuentas | `accounts.ts`, `data/accounts.json` | Usuario o correo, contraseña y rol. No se publica. |
| Datos | Firebase | Auth y Cloud Firestore del proyecto `cyclia-mvp`. Cada documento cuelga de `users/{uid}`. |
| IA | `POST /api/analyze`, `POST /api/chat` | Gemini recibe el contexto del ciclo y del registro, con la clave del servidor y el consentimiento `gemini_assistant`. |
| Agenda | `users/{uid}/activities` | Actividades en Firestore. No hay Google Calendar. |

### Acceso

La entrada con correo es Firebase Auth. No hay pantalla «Sin cuenta».

- **Usuario y contraseña.** El usuario es un correo. Si no existe, Cyclia crea la cuenta y avisa en una ventana. Si existe y la contraseña coincide, avisa que mostrará el calendario y abre la sesión. La contraseña queda cifrada en `data/accounts.json`. Cerrar sesión solo limpia este navegador; la cuenta sigue guardada para el próximo ingreso.
- **Clave que no coincide.** Si el correo ya tiene cuenta y la contraseña es otra, no entra y no crea una cuenta duplicada.
- **Administración.** La cuenta `administrador` vive en el servidor, con rol admin. Si todavía no existe, se crea solo cuando `ADMIN_PASSWORD` está definida. Si ya existe, conserva su clave. Desde Perfil crea y elimina usuarios. Esa cuenta no se puede borrar.
- **24 horas.** Si se marca, la sesión se conserva 24 horas. Si no, termina al cerrar el navegador.

La contraseña del correo la comprueba Firebase Auth. Con ese usuario se guardan el perfil y los registros. La cuenta `administrador` sigue en el servidor.

### Modelo de datos

Las reglas están en `firestore.rules`. Cada documento cuelga de `users/{uid}` y solo lo lee o lo edita esa usuaria.

| Colección | Dónde | Qué guarda |
|-----------|--------|------------|
| Perfil | `users/{uid}` | Nombre, edad, nacimiento, ciclo, anticonceptivo, condiciones, origen de la duración y avisos |
| `daily_logs` | `users/{uid}/daily_logs/{fecha}` | Escalas del día, fluido cervical, estado anímico, energía, sensaciones, manchado, síntomas y el texto del análisis |
| `period_records` | `users/{uid}/period_records/{id}` | Una regla: inicio, fin, volumen y dolor de 0 a 3 |
| `messages` | `users/{uid}/messages/{id}` | Chat con Cyclia: rol, texto y momento |
| `activities` | `users/{uid}/activities/{id}` | Actividad, fecha, horario, duración, estado y notas |
| `focus` | `users/{uid}/focus/{id}` | Estado anterior de Mi Foco |
| `day_plans` | `users/{uid}/day_plans/{fecha}` | Minutos disponibles y energía marcada si el registro del día no la tiene |
| `consent_events` | `users/{uid}/consent_events/{id}` | Decisiones de privacidad, salud y asistente |
| `data_requests` | `users/{uid}/data_requests/{id}` | Pedidos de acceso, corrección o eliminación |

El navegador recibe los cambios con los listeners de Firestore de la sesión que entró.

### Qué recibe y qué entrega el análisis

El cálculo del ciclo y el texto del análisis salen de los mismos campos. El armado está en `src/utils/analysisContext.ts`. El día y la fase salen de `src/utils/cycleModel.ts`. La comparación con los registros está en `src/utils/recordCompare.ts`.

Cyclia no mide hormonas. Una fase es una estimación a partir de la fecha de la regla y de las duraciones ya resueltas. Si el calendario no muestra fases (anticoncepción hormonal, embarazo, posparto, sin regla o predicciones pausadas), el análisis dice que no hay fase y no inventa una. El texto de las fases usa «Muchas mujeres reportan…». El pie sigue siendo: «Las sugerencias aprenden de ti; no reemplazan consejo médico.»

En Registro, «Indicadores de hoy» va primero y en una sola columna. Cada opción es un botón grande. Lo marcado queda oscuro y con una marca. Se puede volver a tocar para quitar fluido, estado o energía. Las sensaciones empiezan en Ninguno y se cambian a Leve o Medio. Clara de huevo se guarda como descripción: muchas mujeres la asocian con días fértiles, y Cyclia no calcula fertilidad. Inquieta no se trata como energía alta ni baja. Esas marcas entran al análisis del día, a la nota del calendario y a la comparación.

Lo que entra en `POST /api/analyze` y `POST /api/chat`, cuando hay consentimiento `gemini_assistant`:

| Dato | De dónde sale | Qué no se envía |
|------|----------------|-----------------|
| Duración del ciclo y de la regla | El promedio usable de 21 a 45 días, o 28 y 5 si todavía no hay tres ciclos en rango | Un largo fuera de 21–45 o un sangrado fuera de 1–10 |
| Día y fase | El día dentro del ciclo que se repite. La fase solo si el calendario la muestra | Una fase fija cuando el modo no muestra fases |
| Método hormonal y situación | `hormonal_method` y `special_situation` | Nombre, correo, peso y estatura |
| Condiciones | Celiaquía, diabetes, obesidad, depresión | Un cambio de tratamiento o de insulina |
| Registro del día y hasta cuatro días anteriores | Escalas, fluido, estado anímico, energía en palabras y sensaciones de `daily_logs` | Un porcentaje que no salga de esos registros. Clara de huevo no se lee como fertilidad |

Escalas de 1 a 5. En energía y concentración, 5 es mucho. En calidad de sueño, cansancio, ánimo, estrés y dolor, 5 es peor. Si el detalle del sueño trae un número con «horas», «hrs» o «h», ese número es el dato de sueño: menos de 7 puede explicar una energía baja; entre 7 y 9 no explica el cansancio por dormir poco. Si no hay horas, se usa la calidad o el estado (bien, regular, mal).

Lo que la app muestra a partir de eso:

- **Inicio y análisis.** Hay 3 nutrientes y 3 ejercicios para la fase estimada. Si el registro marca cansancio, dolor o cólicos, los ejercicios pasan a ser suaves. En el análisis, una gráfica compara la energía marcada con la propuesta de esa fase. La propuesta es lo que muchas mujeres reportan, no una meta. Si el calendario no muestra fases, no hay barra de propuesta.
- **Conocimiento por fase.** Los rangos de días salen de su regla y de su ciclo. El porcentaje y las barras aparecen solo con al menos dos registros en esa fase, y se rotulan «Según tus registros». Sin esos registros no hay porcentaje.
- **Guía de movimiento, nutrición y mente.** Vive dentro de «Ver más». Cada idea tiene una casilla: al marcarla queda en verde y se guarda en el navegador, en `cyclia_phase_guide_` más el id de la cuenta. En la fase ovulatoria las ideas son intervalos si hay energía, un peso conocido, actividad en grupo, vegetales, zinc, arándanos y cacao, y una conversación si apetece. No se afirma una hormona dominante ni una elocuencia medida.
- **Comparación.** Dice cuántos días hay con energía, cansancio o sueño, y si el sueño corto coincide con la energía baja. En una fase con al menos dos energías, informa el promedio de 1 a 5. No compara contra un número fijo de la fase.
- **Agendar.** Al elegir la fecha, muestra el día y la fase de esa fecha. Si la fecha ya tiene registro, agrega la nota de sueño y energía de ese día. La lista agrupa por día y ordena cada día por hora de inicio: la hora queda en una columna y el nombre a la derecha.
- **Actividad del día.** Si no hay fase en el calendario, la idea sigue el registro y no una fase. Si hay una condición de salud, la nota no cambia el tratamiento.
- **Cyclia IA.** Recibe ese mismo contexto. Si no hay fase, omite la sección de fase. El texto queda en `daily_logs.ai_analysis` cuando se pide el análisis del día, y el chat en `messages`.

## Contenido del repositorio

| Ruta | Qué contiene |
|------|--------------|
| `src/` | App de teléfono: pantallas, validación del perfil, cálculo del ciclo, contexto del análisis, plan del día y acceso |
| `server.ts` | Servidor Express, Gemini, consentimiento y exportación |
| `accounts.ts` | Cuenta de administración y contraseñas provisionales |
| `data/accounts.json` | Usuarios, contraseñas y roles locales. No se publica |
| `public/` | Fondo floral de la app |
| `firestore.rules` | Quién puede leer y escribir cada documento |
| `src/firebase.ts` | Acceso y datos en Firebase |
| `design/` | Pantallas HTML para revisar el diseño sin levantar la app |
| `package.json` | Dependencias y scripts (`dev`, `build`, `start`) |

## Ejecutar la aplicación

Requisitos: Node.js. Los datos están en Firebase, proyecto `cyclia-mvp`.

```bash
npm install
cp .env.example .env    # completa las variables
npm run dev             # http://localhost:3001
```

Variables de entorno (ver `.env.example`):

- `GEMINI_API_KEY`: clave de Gemini en el servidor.
- `APP_URL`: origen de la app. En local es `http://localhost:3001`.
- `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID` y `VITE_FIREBASE_APP_ID`: configuración pública de la app web. La clave va solo en el entorno; sin `VITE_FIREBASE_API_KEY` el ingreso con correo no arranca.
- `ADMIN_PASSWORD`: clave de la cuenta `administrador` la primera vez que se crea. Si esa cuenta ya existe, no se cambia.
- `GMAIL_USER` y `GMAIL_APP_PASSWORD`: cuenta de Gmail y contraseña de aplicación. La entrada principal no las usa: la cuenta se crea con el usuario y la contraseña escritos en la pantalla.

Para ver la versión compilada: `npm run build` y luego `npm start`. Si `dist/index.html` existe, `npm run dev` sirve esa carpeta.

## Características de la app

La app ocupa el ancho del teléfono (hasta 480 px, centrada en una pantalla más ancha). El fondo de flores cubre toda la pantalla. Las tarjetas van encima, en blanco, rosado o amarillo.

### Barra inferior

Cinco pestañas fijas.

| Pestaña | Qué muestra | Dato que usa o guarda |
|---------|-------------|------------------------|
| Inicio | Saludo, anillo del día y una sugerencia de comida y bienestar según la fase estimada. Si el registro marca cansancio, el ritmo baja | Lee el perfil, `period_records` y el registro del día |
| Ciclo | Calendario, proyección de 3 ciclos y, en «Ver más», el conocimiento por fase y la guía. El porcentaje de una fase sale solo de los registros de esa fase | Lee el perfil, `period_records` y `daily_logs` |
| Registro | ¿Cómo estás hoy? en cinco pasos: ánimo, energía, cuerpo, números y notas. Al guardar, el análisis muestra la gráfica | Escribe fluido, estado, energía, sensaciones y escalas en `daily_logs` |
| Organiza tu día | Calendario de la semana y el botón para crear una actividad | Lee y escribe `users/{uid}/activities` |
| Perfil | Cuenta, ciclo, objetivos, privacidad y exportación | Lee y actualiza el perfil; la administración también ve las cuentas |

### Organiza tu día

La misma actividad de la agenda puede tener hora o no. Con hora, se queda en ese horario. Sin hora, entra al plan según vencimiento, importancia y dependencias. La energía sale del registro de hoy. La fase del ciclo no cambia el orden. El plan elige una actividad principal y hasta dos que siguen, deja minutos para pausas e imprevistos, y lo que no cabe queda en Puede esperar. Si una tarea se alarga, ella acepta o descarta el ajuste.

### Privacidad

Al entrar, la política se muestra resumida en un recuadro. El primer «Ver más» amplía el resumen. El segundo abre el detalle. La casilla es obligatoria. Desde Perfil se puede exportar un JSON de la cuenta o pedir acceso, corrección y eliminación.

### Evolución

La gráfica de bienestar usa solo los últimos 7 días. El comportamiento de cada día es el promedio de ánimo, estrés, dolor, sueño y cansancio. En esa gráfica, 1 es mejor y queda arriba; 5 es más difícil y queda abajo. La energía y la concentración van al revés: 1 es poco y 5 es mucho. El análisis respeta esa diferencia.

### Estilo

- **Paleta:** Breezy Blue `#3A44C4`, Sunny Yellow `#F6E27F`, Flamingo Pink `#F49A9E`, Beach Blue `#A9C4F0`. Texto `#1B1F5E`.
- **Fondo:** celeste `#E3F1FB` con flores (`public/flores-fondo.svg`). La bienvenida usa un fondo botánico azul.
- **Botones:** la acción principal es rosada y la secundaria es amarilla.
- **Fases:** menstrual rosado, folicular celeste, ovulatoria amarillo, lútea azul.
- **Tipografías:** Josefin Sans para el nombre y los títulos, Nunito Sans para el texto.

## Referencia de diseño (`design/`)

`design/` guarda pantallas en HTML para revisar el diseño sin levantar la app. Se abre `design/index.html`. Los datos de ejemplo son la usuaria Valentina y el día 9 del ciclo. La app en marcha, y los datos que realmente se guardan, son los de `src/` y Firebase.
