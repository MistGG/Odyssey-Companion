-- Public read access for dungeon party meter parses (leaderboard).
-- Inserts remain own-user only via existing meter_parses_insert_own policy.

drop policy if exists meter_parses_select_dungeon_party_public on public.meter_parses;

create policy meter_parses_select_dungeon_party_public
  on public.meter_parses
  for select
  to anon, authenticated
  using (parse_kind = 'dungeon_party');
