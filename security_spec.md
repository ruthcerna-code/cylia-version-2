# Acceso de Cyclia

Cyclia guarda el perfil, los registros diarios y el chat en Supabase. No hay cotizaciones ni Firebase.

La sesión entra con Gmail (`signInWithOAuth`, proveedor `google`), con modo anónimo o con correo. Cada persona autenticada solo puede leer y escribir sus filas:

- `profiles.id = auth.uid()`
- `daily_logs.user_id = auth.uid()`
- `messages.user_id = auth.uid()`

Las políticas están en `supabase/schema.sql` (`profiles_own`, `logs_own`, `messages_own`). El rol anónimo de Supabase también queda como `authenticated` y queda sujeto a las mismas reglas.
