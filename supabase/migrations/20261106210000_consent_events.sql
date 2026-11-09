-- Decisiones de consentimiento de Cyclia. Append-only.
-- No guarda IP ni otros identificadores de dispositivo.
-- Reversa manual al final del archivo. No borra perfiles, registros ni mensajes.

create table if not exists public.consent_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  purpose text not null check (purpose in ('terms', 'privacy_notice', 'health_cycle', 'gemini_assistant', 'google_calendar')),
  action text not null check (action in ('accept', 'reject', 'withdraw')),
  policy_version text not null,
  statement_text text not null,
  source text not null check (source in ('new_user', 'existing_user', 'privacy_settings')),
  created_at timestamptz not null default clock_timestamp()
);

create index if not exists consent_events_user_purpose_id_idx
  on public.consent_events (user_id, purpose, id desc);

alter table public.consent_events enable row level security;

drop policy if exists consent_events_select_own on public.consent_events;
create policy consent_events_select_own on public.consent_events
  for select to authenticated
  using (auth.uid() = user_id);

revoke insert, update, delete on public.consent_events from anon, authenticated;
grant select on public.consent_events to authenticated;

create table if not exists public.data_requests (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('access', 'correction', 'deletion', 'other')),
  detail text not null default '',
  created_at timestamptz not null default clock_timestamp()
);

alter table public.data_requests enable row level security;

drop policy if exists data_requests_own on public.data_requests;
create policy data_requests_own on public.data_requests
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists data_requests_insert_own on public.data_requests;
create policy data_requests_insert_own on public.data_requests
  for insert to authenticated
  with check (auth.uid() = user_id);

grant select, insert on public.data_requests to authenticated;

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
      when 'health_cycle' then 'Autorizo expresamente a [PENDIENTE: responsable del tratamiento] a tratar los datos de salud que decida registrar, incluidos mis registros menstruales, síntomas, ánimo y datos del perfil de ciclo, para guardar mi historial, mostrar el seguimiento de mi ciclo y generar estimaciones de los próximos ciclos, según el borrador de Política de privacidad. Puedo retirar esta autorización desde Privacidad y datos. Esta autorización no cubre el asistente de inteligencia artificial ni Google Calendar.'
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

create or replace function public.has_consent(requested_purpose text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select action = 'accept'
    from public.consent_events
    where user_id = auth.uid()
      and purpose = requested_purpose
      and policy_version = '2026-11-borrador-1'
    order by id desc
    limit 1
  ), false);
$$;

revoke all on function public.record_consent_batch(jsonb, text) from public, anon;
revoke all on function public.has_consent(text) from public, anon;
grant execute on function public.record_consent_batch(jsonb, text) to authenticated;
grant execute on function public.has_consent(text) to authenticated;

-- El seguimiento de salud queda cerrado hasta que exista una aceptación vigente.
-- Leer y eliminar las filas propias sigue disponible para ejercer acceso y supresión.
-- Estas políticas sustituyen el acceso total anterior. La reversa está al final.

drop policy if exists "profiles_own" on public.profiles;
drop policy if exists profiles_select_own on public.profiles;
drop policy if exists profiles_insert_consented on public.profiles;
drop policy if exists profiles_update_consented on public.profiles;
drop policy if exists profiles_delete_own on public.profiles;

create policy profiles_select_own on public.profiles
  for select to authenticated
  using (auth.uid() = id);
create policy profiles_insert_consented on public.profiles
  for insert to authenticated
  with check (auth.uid() = id and public.has_consent('health_cycle'));
create policy profiles_update_consented on public.profiles
  for update to authenticated
  using (auth.uid() = id and public.has_consent('health_cycle'))
  with check (auth.uid() = id and public.has_consent('health_cycle'));
create policy profiles_delete_own on public.profiles
  for delete to authenticated
  using (auth.uid() = id);

drop policy if exists "logs_own" on public.daily_logs;
drop policy if exists logs_select_own on public.daily_logs;
drop policy if exists logs_insert_consented on public.daily_logs;
drop policy if exists logs_update_consented on public.daily_logs;
drop policy if exists logs_delete_own on public.daily_logs;

create policy logs_select_own on public.daily_logs
  for select to authenticated
  using (auth.uid() = user_id);
create policy logs_insert_consented on public.daily_logs
  for insert to authenticated
  with check (auth.uid() = user_id and public.has_consent('health_cycle'));
create policy logs_update_consented on public.daily_logs
  for update to authenticated
  using (auth.uid() = user_id and public.has_consent('health_cycle'))
  with check (auth.uid() = user_id and public.has_consent('health_cycle'));
create policy logs_delete_own on public.daily_logs
  for delete to authenticated
  using (auth.uid() = user_id);

drop policy if exists "messages_own" on public.messages;
drop policy if exists messages_select_own on public.messages;
drop policy if exists messages_insert_consented on public.messages;
drop policy if exists messages_delete_own on public.messages;

create policy messages_select_own on public.messages
  for select to authenticated
  using (auth.uid() = user_id);
create policy messages_insert_consented on public.messages
  for insert to authenticated
  with check (auth.uid() = user_id and public.has_consent('health_cycle') and public.has_consent('gemini_assistant'));
create policy messages_delete_own on public.messages
  for delete to authenticated
  using (auth.uid() = user_id);

-- Reversa manual, en una transacción, si hay que volver al acceso anterior sin borrar datos:
-- drop policy if exists profiles_select_own on public.profiles;
-- drop policy if exists profiles_insert_consented on public.profiles;
-- drop policy if exists profiles_update_consented on public.profiles;
-- drop policy if exists profiles_delete_own on public.profiles;
-- create policy "profiles_own" on public.profiles for all to authenticated using (auth.uid() = id) with check (auth.uid() = id);
-- drop policy if exists logs_select_own on public.daily_logs;
-- drop policy if exists logs_insert_consented on public.daily_logs;
-- drop policy if exists logs_update_consented on public.daily_logs;
-- drop policy if exists logs_delete_own on public.daily_logs;
-- create policy "logs_own" on public.daily_logs for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- drop policy if exists messages_select_own on public.messages;
-- drop policy if exists messages_insert_consented on public.messages;
-- drop policy if exists messages_delete_own on public.messages;
-- create policy "messages_own" on public.messages for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- drop function if exists public.record_consent_batch(jsonb, text);
-- drop function if exists public.has_consent(text);
-- drop table if exists public.data_requests;
-- drop table if exists public.consent_events;
