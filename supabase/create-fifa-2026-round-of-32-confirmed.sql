-- FanVerdict FIFA 2026 Round of 32 confirmed poll creation.
-- Source: official FIFA API, competition 17, season 285023.
-- Calendar URL:
-- https://api.fifa.com/api/v3/calendar/matches?language=en&count=200&idCompetition=17&idSeason=285023
--
-- Last checked: 2026-06-27.
-- Only fixtures with both teams confirmed are loaded.
--
-- Important: FanVerdict game_number is chronological app order. The official
-- FIFA match number is retained in matches.source_ref.
--
-- Run this in the Supabase SQL editor or through the local SQL runner.
-- The script is idempotent:
-- - matches are upserted by (tournament_id, game_number)
-- - one poll is created per match if missing
-- - poll questions, lock times, and the two team options are refreshed
-- - knockout polls have no Tie option

begin;

create temporary table fanverdict_fifa_2026_r32_fixtures (
  game_number integer primary key,
  fifa_match_number integer not null unique,
  team_a text not null,
  team_b text not null,
  starts_at timestamptz not null,
  venue text not null
) on commit drop;

insert into fanverdict_fifa_2026_r32_fixtures (
  game_number,
  fifa_match_number,
  team_a,
  team_b,
  starts_at,
  venue
)
values
  (73, 73, 'South Africa', 'Canada', '2026-06-28 19:00:00+00'::timestamptz, 'Los Angeles Stadium, Los Angeles'),
  (74, 76, 'Brazil', 'Japan', '2026-06-29 17:00:00+00'::timestamptz, 'Houston Stadium, Houston'),
  (75, 74, 'Germany', 'Paraguay', '2026-06-29 20:30:00+00'::timestamptz, 'Boston Stadium, Boston'),
  (76, 75, 'Netherlands', 'Morocco', '2026-06-30 01:00:00+00'::timestamptz, 'Monterrey Stadium, Monterrey'),
  (77, 78, U&'C\00F4te d''Ivoire', 'Norway', '2026-06-30 17:00:00+00'::timestamptz, 'Dallas Stadium, Dallas'),
  (78, 77, 'France', 'Sweden', '2026-06-30 21:00:00+00'::timestamptz, 'New York/New Jersey Stadium, New Jersey'),
  (82, 81, 'USA', 'Bosnia and Herzegovina', '2026-07-02 00:00:00+00'::timestamptz, 'San Francisco Bay Area Stadium, San Francisco Bay Area'),
  (86, 88, 'Australia', 'Egypt', '2026-07-03 18:00:00+00'::timestamptz, 'Dallas Stadium, Dallas'),
  (87, 86, 'Argentina', 'Cabo Verde', '2026-07-03 22:00:00+00'::timestamptz, 'Miami Stadium, Miami');

do $$
begin
  if exists (
    select 1
    from public.matches m
    join fanverdict_fifa_2026_r32_fixtures f
      on m.tournament_id = 'a98200a3-8648-4589-ad47-e8866db1d0e2'::uuid
     and m.source_ref = 'FIFA Match ' || f.fifa_match_number
     and m.game_number <> f.game_number
  ) then
    raise exception 'A confirmed Round of 32 FIFA match already exists under a different FanVerdict game_number.';
  end if;

  if exists (
    select 1
    from public.matches m
    join fanverdict_fifa_2026_r32_fixtures f
      on m.tournament_id = 'a98200a3-8648-4589-ad47-e8866db1d0e2'::uuid
     and m.game_number = f.game_number
    where m.source_ref is not null
      and m.source_ref <> 'FIFA Match ' || f.fifa_match_number
  ) then
    raise exception 'A target FanVerdict game_number already belongs to a different source_ref.';
  end if;
end $$;

insert into public.matches (
  tournament_id,
  game_number,
  source_ref,
  team_a,
  team_b,
  starts_at,
  venue,
  status,
  created_by
)
select
  'a98200a3-8648-4589-ad47-e8866db1d0e2'::uuid,
  fixtures.game_number,
  'FIFA Match ' || fixtures.fifa_match_number,
  fixtures.team_a,
  fixtures.team_b,
  fixtures.starts_at,
  fixtures.venue,
  'scheduled',
  '26472be0-9424-4c82-9e95-f9c409de2772'::uuid
from fanverdict_fifa_2026_r32_fixtures fixtures
on conflict (tournament_id, game_number)
do update set
  source_ref = excluded.source_ref,
  team_a = excluded.team_a,
  team_b = excluded.team_b,
  starts_at = excluded.starts_at,
  venue = excluded.venue,
  status = case
    when public.matches.status in ('completed', 'cancelled') then public.matches.status
    else excluded.status
  end;

with target_matches as (
  select
    m.id as match_id,
    m.tournament_id,
    f.team_a,
    f.team_b,
    f.starts_at
  from fanverdict_fifa_2026_r32_fixtures f
  join public.matches m
    on m.tournament_id = 'a98200a3-8648-4589-ad47-e8866db1d0e2'::uuid
   and m.game_number = f.game_number
)
insert into public.polls (
  tournament_id,
  match_id,
  question,
  locks_at,
  status,
  points_per_correct,
  created_by
)
select
  tm.tournament_id,
  tm.match_id,
  tm.team_a || ' vs ' || tm.team_b || ': who will win?',
  tm.starts_at,
  'open',
  1,
  '26472be0-9424-4c82-9e95-f9c409de2772'::uuid
from target_matches tm
where not exists (
  select 1
  from public.polls p
  where p.match_id = tm.match_id
);

update public.polls p
set
  question = f.team_a || ' vs ' || f.team_b || ': who will win?',
  locks_at = f.starts_at,
  points_per_correct = 1
from public.matches m
join fanverdict_fifa_2026_r32_fixtures f on f.game_number = m.game_number
where p.match_id = m.id
  and m.tournament_id = 'a98200a3-8648-4589-ad47-e8866db1d0e2'::uuid
  and p.status in ('draft', 'open');

with target_polls as (
  select
    p.id as poll_id,
    f.team_a,
    f.team_b
  from fanverdict_fifa_2026_r32_fixtures f
  join public.matches m
    on m.tournament_id = 'a98200a3-8648-4589-ad47-e8866db1d0e2'::uuid
   and m.game_number = f.game_number
  join public.polls p on p.match_id = m.id
),
target_options as (
  select poll_id, team_a as label, 1 as sort_order from target_polls
  union all
  select poll_id, team_b as label, 2 as sort_order from target_polls
)
insert into public.poll_options (poll_id, label, sort_order)
select poll_id, label, sort_order
from target_options
on conflict (poll_id, sort_order)
do update set label = excluded.label;

with target_polls as (
  select p.id as poll_id
  from fanverdict_fifa_2026_r32_fixtures f
  join public.matches m
    on m.tournament_id = 'a98200a3-8648-4589-ad47-e8866db1d0e2'::uuid
   and m.game_number = f.game_number
  join public.polls p on p.match_id = m.id
)
delete from public.poll_options po
using target_polls tp
where po.poll_id = tp.poll_id
  and po.sort_order > 2
  and not exists (
    select 1
    from public.votes v
    where v.selected_option_id = po.id
  );

do $$
begin
  if exists (
    select 1
    from fanverdict_fifa_2026_r32_fixtures f
    join public.matches m
      on m.tournament_id = 'a98200a3-8648-4589-ad47-e8866db1d0e2'::uuid
     and m.game_number = f.game_number
    join public.polls p on p.match_id = m.id
    join public.poll_options po on po.poll_id = p.id
    where po.sort_order > 2
  ) then
    raise exception 'One or more Round of 32 polls still has an extra option. Check existing votes before removing it.';
  end if;
end $$;

commit;

-- Verification: should return 9 rows, each with exactly two poll options.
select
  m.game_number,
  m.source_ref,
  m.team_a,
  m.team_b,
  m.starts_at,
  m.venue,
  p.question,
  p.locks_at,
  p.points_per_correct,
  count(po.id) as option_count,
  string_agg(po.sort_order || ': ' || po.label, ', ' order by po.sort_order) as poll_options
from public.matches m
join public.polls p on p.match_id = m.id
join public.poll_options po on po.poll_id = p.id
where m.tournament_id = 'a98200a3-8648-4589-ad47-e8866db1d0e2'::uuid
  and m.game_number in (73, 74, 75, 76, 77, 78, 82, 86, 87)
group by
  m.game_number,
  m.source_ref,
  m.team_a,
  m.team_b,
  m.starts_at,
  m.venue,
  p.question,
  p.locks_at,
  p.points_per_correct
order by m.game_number;
