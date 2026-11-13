# Acceso de Cyclia

Cyclia guarda el perfil, los registros diarios y el chat en Cloud Firestore, proyecto `cyclia-mvp`.

La sesión de correo entra con Firebase Auth. Cada persona autenticada solo puede leer y escribir sus documentos bajo `users/{uid}`:

- el perfil es el documento `users/{uid}`
- el registro del día es `users/{uid}/daily_logs/{fecha}`
- el chat es `users/{uid}/messages/{id}`

Las reglas están en `firestore.rules`. El identificador de la sesión tiene que ser el `uid` de Firebase.
