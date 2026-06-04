-- FanVerdict cleanup before historical import.
-- Keeps Supabase Auth users and public.profiles.
-- Removes live tournament test data and any previously imported historical data.

begin;

do $$
begin
  if to_regclass('public.historical_bonus_votes') is not null then
    truncate table public.historical_bonus_votes restart identity cascade;
  end if;

  if to_regclass('public.historical_event_scores') is not null then
    truncate table public.historical_event_scores restart identity cascade;
  end if;

  if to_regclass('public.historical_events') is not null then
    truncate table public.historical_events restart identity cascade;
  end if;

  if to_regclass('public.historical_tournament_participants') is not null then
    truncate table public.historical_tournament_participants restart identity cascade;
  end if;

  if to_regclass('public.historical_tournaments') is not null then
    truncate table public.historical_tournaments restart identity cascade;
  end if;

  if to_regclass('public.historical_participants') is not null then
    truncate table public.historical_participants restart identity cascade;
  end if;
end $$;

truncate table
  public.audit_log,
  public.points_ledger,
  public.votes,
  public.poll_options,
  public.polls,
  public.matches,
  public.tournament_members,
  public.tournaments
restart identity cascade;

commit;

