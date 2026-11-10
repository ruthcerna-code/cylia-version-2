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
  has_depression boolean not null default false,
  cycle_length_source text not null default 'manual',
  cycle_reminders boolean not null default false,
  hormonal_method text not null default 'ninguna',
  special_situation text not null default 'ninguna',
  period_length_known boolean not null default true,
  cycle_length_known boolean not null default true,
  perimenopause_mode text not null default 'off',
  constraint profiles_cycle_length_source_check check (cycle_length_source in ('manual', 'records')),
  constraint profiles_hormonal_method_check check (hormonal_method in ('ninguna', 'pastilla', 'diu_hormonal', 'implante', 'inyeccion', 'anillo_parche')),
  constraint profiles_special_situation_check check (special_situation in ('ninguna', 'embarazo', 'posparto_lactancia', 'terapia_hormonal', 'sin_regla')),
  constraint profiles_perimenopause_mode_check check (perimenopause_mode in ('off', 'offered', 'on'))
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
  energy integer,
  concentration integer,
  sleep_state text,
  spotting boolean,
  symptoms text[] not null default '{}',
  hot_flash_count integer,
  hot_flash_intensity integer,
  night_sweat_count integer,
  night_sweat_intensity integer,
  cervical_fluid text,
  felt_state text,
  energy_feel text,
  headache_level text,
  bloating_level text,
  breast_sensitivity_level text,
  pelvic_cramp_level text,
  primary key (user_id, date),
  constraint daily_logs_energy_check check (energy is null or energy between 1 and 5),
  constraint daily_logs_concentration_check check (concentration is null or concentration between 1 and 5),
  constraint daily_logs_sleep_state_check check (sleep_state is null or sleep_state in ('bien', 'regular', 'mal')),
  constraint daily_logs_hot_flash_intensity_check check (hot_flash_intensity is null or hot_flash_intensity between 1 and 3),
  constraint daily_logs_night_sweat_intensity_check check (night_sweat_intensity is null or night_sweat_intensity between 1 and 3),
  constraint daily_logs_cervical_fluid_check check (cervical_fluid is null or cervical_fluid in ('seco', 'pegajoso', 'cremoso', 'clara_de_huevo')),
  constraint daily_logs_felt_state_check check (felt_state is null or felt_state in ('Serena', 'Enfocada', 'Radiante', 'Reflexiva', 'Sensible')),
  constraint daily_logs_energy_feel_check check (energy_feel is null or energy_feel in ('baja', 'estable', 'radiante', 'inquieta')),
  constraint daily_logs_headache_level_check check (headache_level is null or headache_level in ('ninguno', 'leve', 'medio')),
  constraint daily_logs_bloating_level_check check (bloating_level is null or bloating_level in ('ninguno', 'leve', 'medio')),
  constraint daily_logs_breast_sensitivity_level_check check (breast_sensitivity_level is null or breast_sensitivity_level in ('ninguno', 'leve', 'medio')),
  constraint daily_logs_pelvic_cramp_level_check check (pelvic_cramp_level is null or pelvic_cramp_level in ('ninguno', 'leve', 'medio'))
);

create table if not exists public.period_records (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  start_date text not null,
  end_date text,
  volume text,
  pain integer,
  unique (user_id, start_date),
  constraint period_records_volume_check check (volume is null or volume in ('leve', 'moderado', 'abundante', 'muy_abundante')),
  constraint period_records_pain_check check (pain is null or pain between 0 and 3)
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
alter table public.period_records enable row level security;

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

drop policy if exists period_records_own on public.period_records;
create policy period_records_own on public.period_records
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.daily_logs to authenticated;
grant select, insert, update, delete on public.messages to authenticated;
grant select, insert, update, delete on public.period_records to authenticated;

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

-- Actividades agendadas en la base de Cyclia.
-- google_event_id y google_calendar_id quedan vacíos: la conexión externa se retiró.

create table if not exists public.scheduled_activities (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  activity_date text not null,
  start_time text,
  end_time text,
  reminder_minutes integer,
  deadline text,
  estimate_minutes integer,
  importance text check (importance is null or importance in ('alta', 'media', 'baja')),
  depends_on uuid references public.scheduled_activities (id) on delete set null,
  plan_status text not null default 'pendiente' check (plan_status in ('pendiente', 'en_curso', 'hecha', 'pospuesta')),
  sort_order integer,
  steps jsonb not null default '[]'::jsonb,
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

-- Minutos disponibles de un día. No es otra lista de actividades.
create table if not exists public.day_plans (
  user_id uuid not null references auth.users (id) on delete cascade,
  plan_date text not null,
  available_minutes integer not null,
  buffer_minutes integer not null default 30,
  reported_energy integer,
  reported_energy_feel text,
  updated_at timestamptz not null default now(),
  primary key (user_id, plan_date)
);

alter table public.day_plans enable row level security;

drop policy if exists day_plans_own on public.day_plans;
create policy day_plans_own on public.day_plans
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update, delete on public.day_plans to authenticated;

-- Mi Foco: una fila por usuaria. El consentimiento del módulo vive en el payload.
create table if not exists public.focus_entries (
  user_id uuid primary key references auth.users (id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.focus_entries enable row level security;

drop policy if exists focus_entries_own on public.focus_entries;
create policy focus_entries_own on public.focus_entries
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update, delete on public.focus_entries to authenticated;
