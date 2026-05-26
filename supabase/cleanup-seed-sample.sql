-- Removes the optional sample poll/match created by seed-example.sql.
-- Keeps auth users, profiles, tournament memberships, and tournaments.

begin;

delete from public.audit_log
where details->>'poll_id' in (
  select id::text
  from public.polls
  where question = 'Team A vs Team B: who will win?'
);

delete from public.points_ledger
where poll_id in (
  select id
  from public.polls
  where question = 'Team A vs Team B: who will win?'
);

delete from public.votes
where poll_id in (
  select id
  from public.polls
  where question = 'Team A vs Team B: who will win?'
);

delete from public.polls
where question = 'Team A vs Team B: who will win?';

delete from public.matches
where team_a = 'Team A'
  and team_b = 'Team B'
  and venue = 'TBD';

commit;
