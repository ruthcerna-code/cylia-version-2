-- Preferencia de origen de la duración y de recordatorios.
-- No modifica las duraciones ni los registros ya guardados.
-- Reversible: alter table public.profiles drop constraint if exists profiles_cycle_length_source_check;
-- alter table public.profiles drop column if exists cycle_reminders, drop column if exists cycle_length_source;

alter table public.profiles
  add column if not exists cycle_length_source text not null default 'manual',
  add column if not exists cycle_reminders boolean not null default false;

alter table public.profiles
  drop constraint if exists profiles_cycle_length_source_check;

alter table public.profiles
  add constraint profiles_cycle_length_source_check
  check (cycle_length_source in ('manual', 'records'));
