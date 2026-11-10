-- Organiza tu día: la misma actividad gana prioridad, duración y dependencia.
-- El tiempo disponible vive en day_plans, no en otra lista de tareas.
-- Reversible:
-- alter table public.scheduled_activities drop constraint if exists scheduled_activities_importance_check;
-- alter table public.scheduled_activities drop constraint if exists scheduled_activities_plan_status_check;
-- alter table public.scheduled_activities drop column if exists deadline, drop column if exists estimate_minutes, drop column if exists importance, drop column if exists depends_on, drop column if exists plan_status, drop column if exists sort_order, drop column if exists steps;
-- alter table public.scheduled_activities alter column start_time set not null, alter column end_time set not null;
-- drop table if exists public.day_plans;

alter table public.scheduled_activities alter column start_time drop not null;
alter table public.scheduled_activities alter column end_time drop not null;

alter table public.scheduled_activities add column if not exists deadline text;
alter table public.scheduled_activities add column if not exists estimate_minutes integer;
alter table public.scheduled_activities add column if not exists importance text;
alter table public.scheduled_activities add column if not exists depends_on uuid references public.scheduled_activities (id) on delete set null;
alter table public.scheduled_activities add column if not exists plan_status text not null default 'pendiente';
alter table public.scheduled_activities add column if not exists sort_order integer;
alter table public.scheduled_activities add column if not exists steps jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'scheduled_activities_importance_check') then
    alter table public.scheduled_activities
      add constraint scheduled_activities_importance_check
      check (importance is null or importance in ('alta', 'media', 'baja'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'scheduled_activities_plan_status_check') then
    alter table public.scheduled_activities
      add constraint scheduled_activities_plan_status_check
      check (plan_status in ('pendiente', 'en_curso', 'hecha', 'pospuesta'));
  end if;
end $$;

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
