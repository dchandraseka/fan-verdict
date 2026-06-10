-- FanVerdict FIFA 2026 poll format sync for Games 1-12.
-- Derives the question and poll options from the existing match rows.
-- Safe to rerun.

begin;

with target_polls as (
  select
    p.id as poll_id,
    m.game_number,
    m.team_a,
    m.team_b,
    m.starts_at
  from public.matches m
  join public.polls p on p.match_id = m.id
  where m.tournament_id = 'a98200a3-8648-4589-ad47-e8866db1d0e2'::uuid
    and m.game_number between 1 and 12
)
update public.polls p
set
  question = target_polls.team_a || ' vs ' || target_polls.team_b || ': what will be the result?',
  locks_at = target_polls.starts_at,
  points_per_correct = 1
from target_polls
where p.id = target_polls.poll_id
  and p.status in ('draft', 'open');

with target_polls as (
  select
    p.id as poll_id,
    m.team_a,
    m.team_b
  from public.matches m
  join public.polls p on p.match_id = m.id
  where m.tournament_id = 'a98200a3-8648-4589-ad47-e8866db1d0e2'::uuid
    and m.game_number between 1 and 12
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

-- Verification: should return 12 rows, one for each FanVerdict game 1-12.
select
  m.game_number,
  m.team_a,
  m.team_b,
  m.starts_at,
  p.question,
  p.locks_at,
  string_agg(po.sort_order || ': ' || po.label, ', ' order by po.sort_order) as poll_options
from public.matches m
join public.polls p on p.match_id = m.id
join public.poll_options po on po.poll_id = p.id
where m.tournament_id = 'a98200a3-8648-4589-ad47-e8866db1d0e2'::uuid
  and m.game_number between 1 and 12
group by
  m.game_number,
  m.team_a,
  m.team_b,
  m.starts_at,
  p.question,
  p.locks_at
order by m.game_number;
