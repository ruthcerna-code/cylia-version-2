-- Actividades agendadas en Cyclia y la conexión usada para enviarlas a Google Calendar.
-- Ejecutar en el SQL Editor del proyecto de Supabase si la tabla todavía no existe.

create table if not exists public.scheduled_activities (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  activity_date text not null,
  start_time text not null,
  end_time text not null,
  reminder_minutes integer,
  notes text not null default '',
  time_zone text not null default 'UTC',
  sync_status text not null default 'pending' check (sync_status in ('pending', 'synced', 'changed', 'error', 'delete_pending')),
  google_event_id text,
  google_calendar_id text,
  sync_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists scheduled_activities_user_date_idx
  on public.scheduled_activities (user_id, activity_date, start_time);

alter table public.scheduled_activities enable row level security;

drop policy if exists scheduled_activities_own on public.scheduled_activities;
create policy scheduled_activities_own on public.scheduled_activities
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update, delete on public.scheduled_activities to authenticated;

create table if not exists public.calendar_connections (
  user_id uuid primary key references auth.users (id) on delete cascade,
  google_email text not null default '',
  calendar_id text,
  calendar_name text,
  refresh_token text not null,
  last_sync_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.calendar_connections enable row level security;

drop policy if exists calendar_connections_own on public.calendar_connections;
create policy calendar_connections_own on public.calendar_connections
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update, delete on public.calendar_connections to authenticated;
