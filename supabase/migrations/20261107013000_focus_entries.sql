-- Datos de Mi Foco, una fila por usuaria.
-- Reversible: drop table if exists public.focus_entries;

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
