-- Parámetros del ciclo: método hormonal, situación, reglas y registro del día.
-- Reversible: drop table public.period_records;
-- alter table public.profiles drop column hormonal_method, drop column special_situation, drop column period_length_known, drop column cycle_length_known, drop column perimenopause_mode;
-- alter table public.daily_logs drop column energy, drop column concentration, drop column sleep_state, drop column spotting, drop column symptoms, drop column hot_flash_count, drop column hot_flash_intensity, drop column night_sweat_count, drop column night_sweat_intensity;

alter table public.profiles
  add column if not exists hormonal_method text not null default 'ninguna',
  add column if not exists special_situation text not null default 'ninguna',
  add column if not exists period_length_known boolean not null default true,
  add column if not exists cycle_length_known boolean not null default true,
  add column if not exists perimenopause_mode text not null default 'off';

alter table public.profiles drop constraint if exists profiles_hormonal_method_check;
alter table public.profiles
  add constraint profiles_hormonal_method_check
  check (hormonal_method in ('ninguna', 'pastilla', 'diu_hormonal', 'implante', 'inyeccion', 'anillo_parche'));

alter table public.profiles drop constraint if exists profiles_special_situation_check;
alter table public.profiles
  add constraint profiles_special_situation_check
  check (special_situation in ('ninguna', 'embarazo', 'posparto_lactancia', 'terapia_hormonal', 'sin_regla'));

alter table public.profiles drop constraint if exists profiles_perimenopause_mode_check;
alter table public.profiles
  add constraint profiles_perimenopause_mode_check
  check (perimenopause_mode in ('off', 'offered', 'on'));

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

alter table public.period_records enable row level security;

drop policy if exists period_records_own on public.period_records;
create policy period_records_own on public.period_records
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update, delete on public.period_records to authenticated;

alter table public.daily_logs
  add column if not exists energy integer,
  add column if not exists concentration integer,
  add column if not exists sleep_state text,
  add column if not exists spotting boolean,
  add column if not exists symptoms text[] not null default '{}',
  add column if not exists hot_flash_count integer,
  add column if not exists hot_flash_intensity integer,
  add column if not exists night_sweat_count integer,
  add column if not exists night_sweat_intensity integer;

alter table public.daily_logs drop constraint if exists daily_logs_energy_check;
alter table public.daily_logs
  add constraint daily_logs_energy_check check (energy is null or energy between 1 and 5);

alter table public.daily_logs drop constraint if exists daily_logs_concentration_check;
alter table public.daily_logs
  add constraint daily_logs_concentration_check check (concentration is null or concentration between 1 and 5);

alter table public.daily_logs drop constraint if exists daily_logs_sleep_state_check;
alter table public.daily_logs
  add constraint daily_logs_sleep_state_check check (sleep_state is null or sleep_state in ('bien', 'regular', 'mal'));

alter table public.daily_logs drop constraint if exists daily_logs_hot_flash_intensity_check;
alter table public.daily_logs
  add constraint daily_logs_hot_flash_intensity_check check (hot_flash_intensity is null or hot_flash_intensity between 1 and 3);

alter table public.daily_logs drop constraint if exists daily_logs_night_sweat_intensity_check;
alter table public.daily_logs
  add constraint daily_logs_night_sweat_intensity_check check (night_sweat_intensity is null or night_sweat_intensity between 1 and 3);
