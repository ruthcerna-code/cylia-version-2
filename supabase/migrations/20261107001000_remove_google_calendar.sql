-- Retira la conexión con Google Calendar.
-- Las actividades siguen en public.scheduled_activities.
-- Reversible: volver a crear public.calendar_connections como en 20261016180000_scheduled_activities.sql.
-- No borra actividades ni decisiones de consentimiento ya registradas.

drop table if exists public.calendar_connections;

create or replace function public.record_consent_batch(entries jsonb, requested_source text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  version text := '2026-11-borrador-1';
  item jsonb;
  requested_purpose text;
  requested_action text;
  statement text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if requested_source not in ('new_user', 'existing_user', 'privacy_settings') then
    raise exception 'invalid source';
  end if;
  if jsonb_typeof(entries) <> 'array' or jsonb_array_length(entries) < 1 or jsonb_array_length(entries) > 8 then
    raise exception 'invalid entries';
  end if;

  for item in select value from jsonb_array_elements(entries)
  loop
    requested_purpose := item->>'purpose';
    requested_action := item->>'action';
    if requested_action not in ('accept', 'reject', 'withdraw') then
      raise exception 'invalid action';
    end if;
    if requested_action = 'withdraw' and requested_purpose not in ('health_cycle', 'gemini_assistant', 'google_calendar') then
      raise exception 'invalid withdraw';
    end if;
    statement := case requested_purpose
      when 'terms' then 'Acepto los Términos de uso de Cyclia.'
      when 'privacy_notice' then 'He leído la Política de privacidad, donde se explica cómo se trata mi información y cómo ejercer mis derechos.'
      when 'health_cycle' then 'Autorizo expresamente a [PENDIENTE: responsable del tratamiento] a tratar los datos de salud que decida registrar, incluidos mis registros menstruales, síntomas, ánimo y datos del perfil de ciclo, para guardar mi historial, mostrar el seguimiento de mi ciclo y generar estimaciones de los próximos ciclos, según el borrador de Política de privacidad. Puedo retirar esta autorización desde Privacidad y datos. Esta autorización no cubre el asistente de inteligencia artificial.'
      when 'gemini_assistant' then 'Autorizo, de forma opcional, a que Cyclia envíe a Google Gemini los datos de mi perfil, mis registros y los mensajes que yo escriba, solo para generar el análisis del registro y las respuestas de Cyclia IA. Puedo rechazar esta opción y seguir usando el seguimiento del ciclo. Esta casilla no autoriza entrenar modelos de inteligencia artificial.'
      when 'google_calendar' then 'Autorizo, de forma opcional, a conectar Google Calendar para enviar las actividades que yo sincronice desde Cyclia. Puedo rechazar esta opción y guardar actividades solo dentro de Cyclia.'
      else null
    end;
    if statement is null then
      raise exception 'invalid purpose';
    end if;
    insert into public.consent_events (user_id, purpose, action, policy_version, statement_text, source)
    values (auth.uid(), requested_purpose, requested_action, version, statement, requested_source);
  end loop;
end;
$$;
