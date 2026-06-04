-- Adds claimable historical scoring tables for imported IPL scorebooks.
-- This does not alter or delete live voting data tables.

begin;

create extension if not exists pgcrypto;

create table if not exists public.historical_participants (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  normalized_name text not null,
  claimed_profile_id uuid references public.profiles(id) on delete set null,
  claim_status text not null default 'unclaimed'
    check (claim_status in ('unclaimed', 'claimed', 'blocked')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (normalized_name),
  unique (claimed_profile_id)
);

create table if not exists public.historical_tournaments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  season_year integer not null,
  sport text not null default 'Cricket',
  source_file text,
  imported_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (name),
  unique (season_year)
);

create table if not exists public.historical_tournament_participants (
  id uuid primary key default gen_random_uuid(),
  historical_tournament_id uuid not null references public.historical_tournaments(id) on delete cascade,
  historical_participant_id uuid not null references public.historical_participants(id) on delete cascade,
  display_order integer not null,
  source_row integer,
  created_at timestamptz not null default timezone('utc', now()),
  unique (historical_tournament_id, historical_participant_id),
  unique (historical_tournament_id, display_order)
);

create table if not exists public.historical_events (
  id uuid primary key default gen_random_uuid(),
  historical_tournament_id uuid not null references public.historical_tournaments(id) on delete cascade,
  event_key text not null,
  label text not null,
  event_type text not null default 'game'
    check (event_type in ('game', 'playoff', 'bonus')),
  sort_order integer not null,
  source_column text,
  points_available integer not null default 1 check (points_available > 0),
  submitted_vote_count integer not null default 0 check (submitted_vote_count >= 0),
  winning_vote_count integer not null default 0 check (winning_vote_count >= 0),
  majority_threshold integer,
  majority_result text check (majority_result in ('majority_correct', 'minority_correct')),
  correct_option_label text,
  raw_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (historical_tournament_id, event_key),
  unique (historical_tournament_id, sort_order)
);

create table if not exists public.historical_event_scores (
  id uuid primary key default gen_random_uuid(),
  historical_event_id uuid not null references public.historical_events(id) on delete cascade,
  historical_participant_id uuid not null references public.historical_participants(id) on delete cascade,
  outcome text not null check (outcome in ('correct', 'incorrect', 'missed')),
  points_awarded integer not null default 0 check (points_awarded >= 0),
  source_cell text,
  raw_value text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (historical_event_id, historical_participant_id)
);

create table if not exists public.historical_bonus_votes (
  id uuid primary key default gen_random_uuid(),
  historical_event_id uuid not null references public.historical_events(id) on delete cascade,
  historical_participant_id uuid not null references public.historical_participants(id) on delete cascade,
  selected_option_label text not null,
  is_correct boolean not null default false,
  source_cell text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (historical_event_id, historical_participant_id)
);

create index if not exists historical_tournament_participants_participant_idx
on public.historical_tournament_participants (historical_participant_id);

create index if not exists historical_events_tournament_idx
on public.historical_events (historical_tournament_id, sort_order);

create index if not exists historical_event_scores_participant_idx
on public.historical_event_scores (historical_participant_id);

create index if not exists historical_event_scores_event_idx
on public.historical_event_scores (historical_event_id);

create index if not exists historical_bonus_votes_participant_idx
on public.historical_bonus_votes (historical_participant_id);

drop trigger if exists historical_participants_set_updated_at on public.historical_participants;
create trigger historical_participants_set_updated_at
before update on public.historical_participants
for each row execute function public.set_updated_at();

drop trigger if exists historical_tournaments_set_updated_at on public.historical_tournaments;
create trigger historical_tournaments_set_updated_at
before update on public.historical_tournaments
for each row execute function public.set_updated_at();

drop trigger if exists historical_events_set_updated_at on public.historical_events;
create trigger historical_events_set_updated_at
before update on public.historical_events
for each row execute function public.set_updated_at();

drop trigger if exists historical_event_scores_set_updated_at on public.historical_event_scores;
create trigger historical_event_scores_set_updated_at
before update on public.historical_event_scores
for each row execute function public.set_updated_at();

drop trigger if exists historical_bonus_votes_set_updated_at on public.historical_bonus_votes;
create trigger historical_bonus_votes_set_updated_at
before update on public.historical_bonus_votes
for each row execute function public.set_updated_at();

alter table public.historical_participants enable row level security;
alter table public.historical_tournaments enable row level security;
alter table public.historical_tournament_participants enable row level security;
alter table public.historical_events enable row level security;
alter table public.historical_event_scores enable row level security;
alter table public.historical_bonus_votes enable row level security;

drop policy if exists "Authenticated users can read historical participants" on public.historical_participants;
create policy "Authenticated users can read historical participants"
on public.historical_participants for select
to authenticated
using (true);

drop policy if exists "Authenticated users can read historical tournaments" on public.historical_tournaments;
create policy "Authenticated users can read historical tournaments"
on public.historical_tournaments for select
to authenticated
using (true);

drop policy if exists "Authenticated users can read historical tournament participants" on public.historical_tournament_participants;
create policy "Authenticated users can read historical tournament participants"
on public.historical_tournament_participants for select
to authenticated
using (true);

drop policy if exists "Authenticated users can read historical events" on public.historical_events;
create policy "Authenticated users can read historical events"
on public.historical_events for select
to authenticated
using (true);

drop policy if exists "Authenticated users can read historical event scores" on public.historical_event_scores;
create policy "Authenticated users can read historical event scores"
on public.historical_event_scores for select
to authenticated
using (true);

drop policy if exists "Authenticated users can read historical bonus votes" on public.historical_bonus_votes;
create policy "Authenticated users can read historical bonus votes"
on public.historical_bonus_votes for select
to authenticated
using (true);

create or replace view public.historical_standings
with (security_invoker = true) as
select
  ht.id as historical_tournament_id,
  ht.name as tournament_name,
  ht.season_year,
  hp.id as historical_participant_id,
  hp.display_name,
  hp.claimed_profile_id,
  hp.claim_status,
  sum(hes.points_awarded) as total_points,
  sum(hes.points_awarded) filter (where he.event_type = 'bonus') as bonus_points,
  count(*) filter (where hes.outcome = 'correct') as correct_picks,
  count(*) filter (where hes.outcome = 'incorrect') as incorrect_picks,
  count(*) filter (where hes.outcome = 'missed') as missed_events,
  count(*) filter (where hes.outcome in ('correct', 'incorrect')) as participated_events,
  count(*) as total_events,
  count(*) filter (where he.event_type <> 'bonus' and hes.outcome = 'correct') as regular_correct_picks,
  count(*) filter (where he.event_type <> 'bonus' and hes.outcome = 'incorrect') as regular_incorrect_picks,
  count(*) filter (where he.event_type <> 'bonus' and hes.outcome = 'missed') as regular_missed_events,
  count(*) filter (where he.event_type <> 'bonus' and hes.outcome in ('correct', 'incorrect')) as regular_participated_events,
  case
    when count(*) filter (where hes.outcome in ('correct', 'incorrect')) = 0 then 0
    else round(
      (
        count(*) filter (where hes.outcome = 'correct')::numeric
        / count(*) filter (where hes.outcome in ('correct', 'incorrect'))::numeric
      ) * 100,
      2
    )
  end as accuracy_percent,
  case
    when count(*) filter (where he.event_type <> 'bonus' and hes.outcome in ('correct', 'incorrect')) = 0 then 0
    else round(
      (
        count(*) filter (where he.event_type <> 'bonus' and hes.outcome = 'correct')::numeric
        / count(*) filter (where he.event_type <> 'bonus' and hes.outcome in ('correct', 'incorrect'))::numeric
      ) * 100,
      2
    )
  end as regular_accuracy_percent
from public.historical_tournaments ht
join public.historical_events he
  on he.historical_tournament_id = ht.id
join public.historical_event_scores hes
  on hes.historical_event_id = he.id
join public.historical_participants hp
  on hp.id = hes.historical_participant_id
group by
  ht.id,
  ht.name,
  ht.season_year,
  hp.id,
  hp.display_name,
  hp.claimed_profile_id,
  hp.claim_status;

create or replace view public.historical_event_summary
with (security_invoker = true) as
select
  ht.id as historical_tournament_id,
  ht.name as tournament_name,
  ht.season_year,
  he.id as historical_event_id,
  he.event_key,
  he.label,
  he.event_type,
  he.sort_order,
  he.points_available,
  he.submitted_vote_count,
  he.winning_vote_count,
  he.majority_threshold,
  he.majority_result,
  he.correct_option_label,
  count(*) filter (where hes.outcome = 'correct') as correct_count,
  count(*) filter (where hes.outcome = 'incorrect') as incorrect_count,
  count(*) filter (where hes.outcome = 'missed') as missed_count
from public.historical_tournaments ht
join public.historical_events he
  on he.historical_tournament_id = ht.id
left join public.historical_event_scores hes
  on hes.historical_event_id = he.id
group by
  ht.id,
  ht.name,
  ht.season_year,
  he.id,
  he.event_key,
  he.label,
  he.event_type,
  he.sort_order,
  he.points_available,
  he.submitted_vote_count,
  he.winning_vote_count,
  he.majority_threshold,
  he.majority_result,
  he.correct_option_label;

commit;
