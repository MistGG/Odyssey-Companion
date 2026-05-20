-- Odyssey Companion — dungeon party meter parses (schema v3 payload)
-- Run in Supabase SQL Editor after clearing old rows if desired:
--   truncate table public.meter_parses;

-- ---------------------------------------------------------------------------
-- Extend meter_parses (skip if you are creating the table fresh — see bottom)
-- ---------------------------------------------------------------------------

alter table public.meter_parses
  add column if not exists parse_kind text not null default 'solo',
  add column if not exists dungeon_id text,
  add column if not exists dungeon_name text,
  add column if not exists difficulty text,
  add column if not exists difficulty_id smallint;

-- Remove legacy party_key if a prior migration added it.
alter table public.meter_parses drop column if exists party_key;

comment on column public.meter_parses.parse_kind is 'solo | party | dungeon_party';
comment on column public.meter_parses.difficulty_id is '1 Story, 2 Normal, 3 Hard (EventStream)';
comment on column public.meter_parses.payload is 'JSON: schemaVersion 1 solo, 2 party, 3 dungeon_party with per-digimon skills';

-- Only Normal+ dungeon parses may be stored (client also enforces).
alter table public.meter_parses
  drop constraint if exists meter_parses_dungeon_upload_ck;

alter table public.meter_parses
  add constraint meter_parses_dungeon_upload_ck check (
    parse_kind is distinct from 'dungeon_party'
    or (
      dungeon_id is not null
      and btrim(dungeon_id) <> ''
      and difficulty_id is not null
      and difficulty_id >= 2
    )
  );

create index if not exists meter_parses_dungeon_list_idx
  on public.meter_parses (dungeon_id, difficulty_id, created_at desc)
  where parse_kind = 'dungeon_party';

create index if not exists meter_parses_user_created_idx
  on public.meter_parses (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Fresh install (only if meter_parses does not exist yet)
-- ---------------------------------------------------------------------------
/*
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy profiles_select_own on public.profiles
  for select to authenticated using (auth.uid() = id);

create policy profiles_insert_own on public.profiles
  for insert to authenticated with check (auth.uid() = id);

create policy profiles_update_own on public.profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

create table if not exists public.meter_parses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  app_version text,
  total_damage bigint not null default 0,
  duration_sec numeric not null default 0,
  hit_count integer not null default 0,
  parse_kind text not null default 'solo',
  dungeon_id text,
  dungeon_name text,
  difficulty text,
  difficulty_id smallint,
  payload jsonb not null default '{}'::jsonb,
  constraint meter_parses_dungeon_upload_ck check (
    parse_kind is distinct from 'dungeon_party'
    or (
      dungeon_id is not null
      and btrim(dungeon_id) <> ''
      and difficulty_id is not null
      and difficulty_id >= 2
    )
  )
);

alter table public.meter_parses enable row level security;

create policy meter_parses_select_own on public.meter_parses
  for select to authenticated using (auth.uid() = user_id);

create policy meter_parses_insert_own on public.meter_parses
  for insert to authenticated with check (auth.uid() = user_id);
*/
