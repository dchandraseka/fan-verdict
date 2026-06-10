-- FanVerdict FIFA 2026 group-stage poll creation for Games 13-72.
-- Source basis: FIFA World Cup 2026 group-stage schedule as published on the
-- tournament group pages, with FIFA match report links referenced there.
--
-- Important: FanVerdict game_number continues the chronological sequence you
-- already entered manually for Games 1-12. It is not FIFA's official match number.
-- The official FIFA match number is retained in matches.source_ref.
--
-- Run this in the Supabase SQL editor. The script is idempotent:
-- - matches are upserted by (tournament_id, game_number)
-- - one poll is created per match if missing
-- - poll questions, lock times, and the three option labels are refreshed

begin;

create temporary table fanverdict_fifa_2026_fixtures (
  game_number integer primary key,
  fifa_match_number integer not null,
  team_a text not null,
  team_b text not null,
  starts_at timestamptz not null
) on commit drop;

insert into fanverdict_fifa_2026_fixtures (game_number, fifa_match_number, team_a, team_b, starts_at)
values
    (13, 14, 'Spain', 'Cape Verde', '2026-06-15 16:00:00+00'::timestamptz),
    (14, 16, 'Belgium', 'Egypt', '2026-06-15 19:00:00+00'::timestamptz),
    (15, 13, 'Saudi Arabia', 'Uruguay', '2026-06-15 22:00:00+00'::timestamptz),
    (16, 15, 'Iran', 'New Zealand', '2026-06-16 01:00:00+00'::timestamptz),
    (17, 17, 'France', 'Senegal', '2026-06-16 19:00:00+00'::timestamptz),
    (18, 18, 'Iraq', 'Norway', '2026-06-16 22:00:00+00'::timestamptz),
    (19, 19, 'Argentina', 'Algeria', '2026-06-17 01:00:00+00'::timestamptz),
    (20, 20, 'Austria', 'Jordan', '2026-06-17 04:00:00+00'::timestamptz),
    (21, 23, 'Portugal', 'DR Congo', '2026-06-17 17:00:00+00'::timestamptz),
    (22, 22, 'England', 'Croatia', '2026-06-17 20:00:00+00'::timestamptz),
    (23, 21, 'Ghana', 'Panama', '2026-06-17 23:00:00+00'::timestamptz),
    (24, 24, 'Uzbekistan', 'Colombia', '2026-06-18 02:00:00+00'::timestamptz),
    (25, 25, 'Czechia', 'South Africa', '2026-06-18 16:00:00+00'::timestamptz),
    (26, 26, 'Switzerland', 'Bosnia', '2026-06-18 19:00:00+00'::timestamptz),
    (27, 27, 'Canada', 'Qatar', '2026-06-18 22:00:00+00'::timestamptz),
    (28, 28, 'Mexico', 'South Korea', '2026-06-19 01:00:00+00'::timestamptz),
    (29, 32, 'USA', 'Australia', '2026-06-19 19:00:00+00'::timestamptz),
    (30, 30, 'Scotland', 'Morocco', '2026-06-19 22:00:00+00'::timestamptz),
    (31, 29, 'Brazil', 'Haiti', '2026-06-20 00:30:00+00'::timestamptz),
    (32, 31, 'Turkey', 'Paraguay', '2026-06-20 03:00:00+00'::timestamptz),
    (33, 35, 'Netherlands', 'Sweden', '2026-06-20 17:00:00+00'::timestamptz),
    (34, 33, 'Germany', 'Ivory Coast', '2026-06-20 20:00:00+00'::timestamptz),
    (35, 34, 'Ecuador', 'Curaçao', '2026-06-21 00:00:00+00'::timestamptz),
    (36, 36, 'Tunisia', 'Japan', '2026-06-21 04:00:00+00'::timestamptz),
    (37, 38, 'Spain', 'Saudi Arabia', '2026-06-21 16:00:00+00'::timestamptz),
    (38, 39, 'Belgium', 'Iran', '2026-06-21 19:00:00+00'::timestamptz),
    (39, 37, 'Uruguay', 'Cape Verde', '2026-06-21 22:00:00+00'::timestamptz),
    (40, 40, 'New Zealand', 'Egypt', '2026-06-22 01:00:00+00'::timestamptz),
    (41, 43, 'Argentina', 'Austria', '2026-06-22 17:00:00+00'::timestamptz),
    (42, 42, 'France', 'Iraq', '2026-06-22 21:00:00+00'::timestamptz),
    (43, 41, 'Norway', 'Senegal', '2026-06-23 00:00:00+00'::timestamptz),
    (44, 44, 'Jordan', 'Algeria', '2026-06-23 03:00:00+00'::timestamptz),
    (45, 47, 'Portugal', 'Uzbekistan', '2026-06-23 17:00:00+00'::timestamptz),
    (46, 45, 'England', 'Ghana', '2026-06-23 20:00:00+00'::timestamptz),
    (47, 46, 'Panama', 'Croatia', '2026-06-23 23:00:00+00'::timestamptz),
    (48, 48, 'Colombia', 'DR Congo', '2026-06-24 02:00:00+00'::timestamptz),
    (49, 51, 'Switzerland', 'Canada', '2026-06-24 19:00:00+00'::timestamptz),
    (50, 52, 'Bosnia', 'Qatar', '2026-06-24 19:00:00+00'::timestamptz),
    (51, 49, 'Scotland', 'Brazil', '2026-06-24 22:00:00+00'::timestamptz),
    (52, 50, 'Morocco', 'Haiti', '2026-06-24 22:00:00+00'::timestamptz),
    (53, 53, 'Czechia', 'Mexico', '2026-06-25 01:00:00+00'::timestamptz),
    (54, 54, 'South Africa', 'South Korea', '2026-06-25 01:00:00+00'::timestamptz),
    (55, 55, 'Curaçao', 'Ivory Coast', '2026-06-25 20:00:00+00'::timestamptz),
    (56, 56, 'Ecuador', 'Germany', '2026-06-25 20:00:00+00'::timestamptz),
    (57, 57, 'Japan', 'Sweden', '2026-06-25 23:00:00+00'::timestamptz),
    (58, 58, 'Tunisia', 'Netherlands', '2026-06-25 23:00:00+00'::timestamptz),
    (59, 59, 'Turkey', 'USA', '2026-06-26 02:00:00+00'::timestamptz),
    (60, 60, 'Paraguay', 'Australia', '2026-06-26 02:00:00+00'::timestamptz),
    (61, 61, 'Norway', 'France', '2026-06-26 19:00:00+00'::timestamptz),
    (62, 62, 'Senegal', 'Iraq', '2026-06-26 19:00:00+00'::timestamptz),
    (63, 65, 'Cape Verde', 'Saudi Arabia', '2026-06-27 00:00:00+00'::timestamptz),
    (64, 66, 'Uruguay', 'Spain', '2026-06-27 00:00:00+00'::timestamptz),
    (65, 63, 'Egypt', 'Iran', '2026-06-27 03:00:00+00'::timestamptz),
    (66, 64, 'New Zealand', 'Belgium', '2026-06-27 03:00:00+00'::timestamptz),
    (67, 67, 'Panama', 'England', '2026-06-27 21:00:00+00'::timestamptz),
    (68, 68, 'Croatia', 'Ghana', '2026-06-27 21:00:00+00'::timestamptz),
    (69, 71, 'Colombia', 'Portugal', '2026-06-27 23:30:00+00'::timestamptz),
    (70, 72, 'DR Congo', 'Uzbekistan', '2026-06-27 23:30:00+00'::timestamptz),
    (71, 69, 'Algeria', 'Austria', '2026-06-28 02:00:00+00'::timestamptz),
    (72, 70, 'Jordan', 'Argentina', '2026-06-28 02:00:00+00'::timestamptz);

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
  null,
  'scheduled',
  '26472be0-9424-4c82-9e95-f9c409de2772'::uuid
from fanverdict_fifa_2026_fixtures fixtures
on conflict (tournament_id, game_number)
do update set
  source_ref = excluded.source_ref,
  team_a = excluded.team_a,
  team_b = excluded.team_b,
  starts_at = excluded.starts_at,
  status = case
    when public.matches.status in ('completed', 'cancelled') then public.matches.status
    else excluded.status
  end;

with target_matches as (
  select
    m.id as match_id,
    m.tournament_id,
    f.game_number,
    f.team_a,
    f.team_b,
    f.starts_at
  from fanverdict_fifa_2026_fixtures f
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
  tm.team_a || ' vs ' || tm.team_b || ': what will be the result?',
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
  question = f.team_a || ' vs ' || f.team_b || ': what will be the result?',
  locks_at = f.starts_at,
  points_per_correct = 1
from public.matches m
join fanverdict_fifa_2026_fixtures f on f.game_number = m.game_number
where p.match_id = m.id
  and m.tournament_id = 'a98200a3-8648-4589-ad47-e8866db1d0e2'::uuid
  and p.status in ('draft', 'open');

with target_polls as (
  select
    p.id as poll_id,
    f.team_a,
    f.team_b
  from fanverdict_fifa_2026_fixtures f
  join public.matches m
    on m.tournament_id = 'a98200a3-8648-4589-ad47-e8866db1d0e2'::uuid
   and m.game_number = f.game_number
  join public.polls p on p.match_id = m.id
),
target_options as (
  select poll_id, team_a as label, 1 as sort_order from target_polls
  union all
  select poll_id, team_b as label, 2 as sort_order from target_polls
  union all
  select poll_id, 'Tie' as label, 3 as sort_order from target_polls
)
insert into public.poll_options (poll_id, label, sort_order)
select poll_id, label, sort_order
from target_options
on conflict (poll_id, sort_order)
do update set label = excluded.label;

commit;

-- Verification: should return 60 rows, one for each FanVerdict game 13-72.
select
  m.game_number,
  m.source_ref,
  m.team_a,
  m.team_b,
  m.starts_at,
  p.question,
  string_agg(po.sort_order || ': ' || po.label, ', ' order by po.sort_order) as poll_options
from public.matches m
join public.polls p on p.match_id = m.id
join public.poll_options po on po.poll_id = p.id
where m.tournament_id = 'a98200a3-8648-4589-ad47-e8866db1d0e2'::uuid
  and m.game_number between 13 and 72
group by
  m.game_number,
  m.source_ref,
  m.team_a,
  m.team_b,
  m.starts_at,
  p.question
order by m.game_number;
