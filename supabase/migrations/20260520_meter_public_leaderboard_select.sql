-- Public read access for dungeon party meter parses (leaderboard).
-- Inserts remain own-user only via existing meter_parses_insert_own policy.

drop policy if exists meter_parses_select_dungeon_party_public on public.meter_parses;

-- anon only: signed-in users on My Parses must use meter_parses_select_own, not this policy.
create policy meter_parses_select_dungeon_party_public
  on public.meter_parses
  for select
  to anon
  using (
    parse_kind = 'dungeon_party'
    and difficulty_id is not null
    and difficulty_id >= 2
  );
