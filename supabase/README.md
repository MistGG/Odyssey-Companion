# Supabase test — DPS meter parses

Use this after creating a project at [supabase.com](https://supabase.com) (free tier is fine).

## 1. Create tables and RLS

In the Supabase dashboard: **SQL** → **New query**, paste and run:

```sql
-- Profiles (one row per auth user; display name for leaderboards later)
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id);

-- Saved meter sessions (uploaded from Odyssey Companion)
create table if not exists public.meter_parses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  app_version text,
  total_damage bigint not null,
  duration_sec integer not null default 0,
  hit_count integer not null default 0,
  payload jsonb not null default '{}'::jsonb
);

create index if not exists meter_parses_user_created_idx
  on public.meter_parses (user_id, created_at desc);

alter table public.meter_parses enable row level security;

create policy "meter_parses_select_own"
  on public.meter_parses for select
  using (auth.uid() = user_id);

create policy "meter_parses_insert_own"
  on public.meter_parses for insert
  with check (auth.uid() = user_id);

-- Shared boss timer schedule (public app-wide timer corrections)
create table if not exists public.boss_schedules (
  boss_id text primary key,
  anchor_utc_ms bigint not null,
  alive_window_ms integer not null,
  respawn_wait_ms integer not null,
  updated_at_ms bigint not null,
  updated_at timestamptz not null default now()
);

alter table public.boss_schedules enable row level security;

drop policy if exists "boss_schedules_select_all" on public.boss_schedules;
drop policy if exists "boss_schedules_insert_all" on public.boss_schedules;
drop policy if exists "boss_schedules_update_all" on public.boss_schedules;

create policy "boss_schedules_select_all"
  on public.boss_schedules for select
  using (true);

-- Timer admins. Add your auth user id to this table.
create table if not exists public.timer_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.timer_admins enable row level security;

drop policy if exists "timer_admins_select_own" on public.timer_admins;

create policy "timer_admins_select_own"
  on public.timer_admins for select
  using (auth.uid() = user_id);
```

## 2. Auth settings (testing)

**Authentication** → **Providers** → enable **Email**.

For quick testing you can disable email confirmation: **Authentication** → **Providers** → **Email** → turn off “Confirm email” (turn it back on for production).

**Display name (meter sign-up field):** The companion saves it on the auth user (`user_metadata.display_name`) and upserts `public.profiles`. If **email confirmation** is enabled, the first `signUp` response often has **no JWT yet**, so the immediate `profiles` upsert can fail RLS; the name is still on the user record and is copied into `profiles` the **first time you sign in** after confirming (requires the `profiles` table + policies from §1). If your party label stays anonymous, check **Table Editor → profiles** for a row with your `display_name`.

## 3. Keys for the build (companion + Odyssey Calc)

Use the **same** Supabase project for both apps.

**Project Settings** → **API**:

- **Project URL** and **publishable / anon public** key (never the `service_role` key).

**Odyssey Companion (this repo):** set at **build time** (not in the meter UI):

- Create `.env.local` in the project root (see `.env.example`) with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, then run `npm run dev` or `npm run build` / pack.

**Odyssey Calc (digimon-hub):** same variable names in that project’s env for the **Meter parses** page.

## 4. Optional: new users get a profile row automatically

If you prefer a DB trigger instead of the app’s `upsert` on sign-up, you can add a trigger on `auth.users`; the companion already upserts `profiles` after sign-up.

## 5. Payload shape (`meter_parses.payload`)

**Solo (schema v1):** `{ "schemaVersion": 1, "skills": [ { "skill", "damage", "hits" } ] }`. Overall DPS, per-skill DPS, and damage share are derived from `skills` plus the row’s `duration_sec`. Columns `total_damage` and `hit_count` are filled from the same skill rows for quick listing.

**Party snapshot (schema v2):** `{ "schemaVersion": 2, "kind": "party", "partyKey", "capturedAtMs", "members": [ { "memberKey" ("self" or auth uuid), "displayLabel", "totalDamage", "durationSec", "skills" } ] }`. Written when the companion uploads **while a party key is active**; the Odyssey Calc **Meter** page lists these under **Party parses** with the same roster + per-player skill drill-down as the meter UI.

## 6. In the companion

Open the **DPS meter** → **gear** → **Parse cloud**. Sign up or sign in (same Supabase project as above), then **Upload current session**. View parse history on **Odyssey Calc** → **Meter parses** (log in there with the same account).

## 7. Party DPS (live) — Realtime broadcast

The meter can show a **shared party list** (everyone’s live DPS) when each player uses the same **party key** under **gear** → **Party DPS (live)**. This uses **Supabase Realtime** only:

- **No database rows** are written for party sync; payloads are broadcast on channels named `meter_party_{KEY}`:
  - Event **`meter`**: periodic live totals + skill snapshot per player.
  - Event **`meter_party_sync`**: party-wide **session reset** so everyone shares the same “session clock” — sent when someone **resets** the meter or **joins** the party channel (others clear totals/time and reset the DPS reader).
- Each client sends **`profiles.display_name`** as the visible party name (never email). If the profile row is missing or empty, the app falls back to an anonymous `Player_…` style label until the profile is fixed.
- The client keeps the key in **sessionStorage** for the tab session and clears it on **Leave party** or **Sign out**.
- The key string itself is **not reserved** on Supabase: when nobody is subscribed to `meter_party_{KEY}`, that room is effectively gone until someone joins again with the same letters (so prefer a long random key for private groups).

In the Supabase dashboard, ensure **Realtime** is enabled for the project (default on new projects). If party mode shows a channel error, open **Project Settings** → **Realtime** and confirm the service is on; for self-hosted or restricted setups, allow **Broadcast** for anonymous authenticated clients as required by your security model.

## 8. Boss timer admin updates

Boss timer reads are public through `public.boss_schedules`, but writes go through the Edge Function in `supabase/functions/update-boss-schedule`. Deploy it with the Supabase CLI:

```sh
supabase functions deploy update-boss-schedule
```

Then add your signed-in Supabase auth user to the allowlist. Replace the email with the admin account you use in Odyssey Companion:

```sql
insert into public.timer_admins (user_id)
select id
from auth.users
where email = 'you@example.com'
on conflict (user_id) do nothing;
```

The app will read the shared timer for everyone. Publishing changes from `Spawn now` / `Death now` requires being signed in with an allowlisted admin account; otherwise the change stays local only.
