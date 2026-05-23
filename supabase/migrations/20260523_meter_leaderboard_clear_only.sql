-- Public leaderboard reads: only full boss clears (not mid-run manual uploads).

drop policy if exists meter_parses_select_dungeon_party_public on public.meter_parses;

create policy meter_parses_select_dungeon_party_public
  on public.meter_parses
  for select
  to anon
  using (
    parse_kind = 'dungeon_party'
    and difficulty_id is not null
    and difficulty_id >= 2
    and coalesce(
      nullif(payload #>> '{dungeon,leaderboardEligible}', '')::boolean,
      (payload #>> '{dungeon,runOutcome}') = 'clear'
    ) = true
  );
