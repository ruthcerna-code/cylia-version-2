-- Daily indicators the register collects and the analysis reads.
-- alter table public.daily_logs drop column cervical_fluid, drop column felt_state, drop column energy_feel, drop column headache_level, drop column bloating_level, drop column breast_sensitivity_level, drop column pelvic_cramp_level;

alter table public.daily_logs
  add column if not exists cervical_fluid text,
  add column if not exists felt_state text,
  add column if not exists energy_feel text,
  add column if not exists headache_level text,
  add column if not exists bloating_level text,
  add column if not exists breast_sensitivity_level text,
  add column if not exists pelvic_cramp_level text;

alter table public.daily_logs drop constraint if exists daily_logs_cervical_fluid_check;
alter table public.daily_logs
  add constraint daily_logs_cervical_fluid_check check (cervical_fluid is null or cervical_fluid in ('seco', 'pegajoso', 'cremoso', 'clara_de_huevo'));

alter table public.daily_logs drop constraint if exists daily_logs_felt_state_check;
alter table public.daily_logs
  add constraint daily_logs_felt_state_check check (felt_state is null or felt_state in ('Serena', 'Enfocada', 'Radiante', 'Reflexiva', 'Sensible'));

alter table public.daily_logs drop constraint if exists daily_logs_energy_feel_check;
alter table public.daily_logs
  add constraint daily_logs_energy_feel_check check (energy_feel is null or energy_feel in ('baja', 'estable', 'radiante', 'inquieta'));

alter table public.daily_logs drop constraint if exists daily_logs_headache_level_check;
alter table public.daily_logs
  add constraint daily_logs_headache_level_check check (headache_level is null or headache_level in ('ninguno', 'leve', 'medio'));

alter table public.daily_logs drop constraint if exists daily_logs_bloating_level_check;
alter table public.daily_logs
  add constraint daily_logs_bloating_level_check check (bloating_level is null or bloating_level in ('ninguno', 'leve', 'medio'));

alter table public.daily_logs drop constraint if exists daily_logs_breast_sensitivity_level_check;
alter table public.daily_logs
  add constraint daily_logs_breast_sensitivity_level_check check (breast_sensitivity_level is null or breast_sensitivity_level in ('ninguno', 'leve', 'medio'));

alter table public.daily_logs drop constraint if exists daily_logs_pelvic_cramp_level_check;
alter table public.daily_logs
  add constraint daily_logs_pelvic_cramp_level_check check (pelvic_cramp_level is null or pelvic_cramp_level in ('ninguno', 'leve', 'medio'));
