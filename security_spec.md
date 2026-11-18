# Acceso de Cyclia

Cyclia guarda los datos en Cloud Firestore, proyecto `cyclia-mvp`. La sesión de correo entra con Firebase Auth.

Cada persona autenticada solo puede leer y escribir sus propios documentos, bajo `users/{uid}`. El identificador de la sesión tiene que ser el `uid` de Firebase.

| Datos | Ruta | Quién escribe |
|-------|------|---------------|
| Perfil (desde los 18 años) | `users/{uid}` | La dueña |
| Registro del día | `users/{uid}/daily_logs/{fecha}` | La dueña |
| Reglas del ciclo | `users/{uid}/period_records/{id}` | La dueña |
| Chat con Cyclia | `users/{uid}/messages/{id}` | La dueña |
| Actividades | `users/{uid}/activities/{id}` | La dueña |
| Tu movimiento de hoy | `users/{uid}/movement_days/{fecha}` | La dueña |
| Tu patrón del mes | `users/{uid}/behavior/mes-{N}` | La dueña |
| Consentimientos | `users/{uid}/consent_events/{id}` | Se crean y no se editan ni se borran |
| Solicitudes de datos | `users/{uid}/data_requests/{id}` | Se crean y no se editan ni se borran |
| Datos de versiones anteriores | `users/{uid}/focus/{id}`, `users/{uid}/day_plans/{fecha}` | La app actual no los escribe |

- Las reglas están en `firestore.rules` y hay que publicarlas para que valgan. Ver «Reglas de Firestore» en el README.
- El servidor no guarda claves de las usuarias. Lee y escribe en Firestore con el token de la sesión de cada una.
- La clave de la IA (`ANTHROPIC_API_KEY`) vive solo en el servidor. La IA nunca recibe nombre, correo, fecha de nacimiento ni peso.
