-- Perfil, registros diarios y chat de Cyclia.
-- Ejecutar en el SQL Editor del proyecto de Supabase.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  age integer not null,
  birth_date text not null,
  weight double precision not null,
  height double precision not null,
  email text not null default '',
  last_period_date text not null,
  period_length integer not null,
  cycle_length integer not null,
  contraceptive text not null,
  is_celiac boolean not null default false,
  has_diabetes boolean not null default false,
  has_obesity boolean not null default false,
  has_depression boolean not null default false
);

create table if not exists public.daily_logs (
  user_id uuid not null references auth.users (id) on delete cascade,
  date text not null,
  sleep_quality integer not null,
  fatigue integer not null,
  pain integer not null,
  stress integer not null,
  mood integer not null,
  sleep_details text not null default '',
  additional_notes text not null default '',
  behavior text not null default '',
  ai_analysis text,
  primary key (user_id, date)
);

create table if not exists public.messages (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  timestamp text not null,
  created_at bigint not null
);

alter table public.profiles enable row level security;
alter table public.daily_logs enable row level security;
alter table public.messages enable row level security;

drop policy if exists "profiles_own" on public.profiles;
create policy "profiles_own" on public.profiles
  for all to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "logs_own" on public.daily_logs;
create policy "logs_own" on public.daily_logs
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "messages_own" on public.messages;
create policy "messages_own" on public.messages
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.daily_logs to authenticated;
grant select, insert, update, delete on public.messages to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.profiles;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.daily_logs;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null;
end $$;

-- Actividades agendadas en Cyclia y conexión de Google Calendar.
-- La sincronización es manual y solo de Cyclia hacia Google.

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
