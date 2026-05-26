-- Optional starter data for FanVerdict.
-- Run this after princedinesh@yahoo.com has signed up in Supabase Auth.

do $$
declare
  owner_id uuid;
  tournament_id uuid;
  match_id uuid;
begin
  select au.id
    into owner_id
  from auth.users au
  where au.email = 'princedinesh@yahoo.com'
  limit 1;

  if owner_id is null then
    raise exception 'Admin user not found. Sign up with princedinesh@yahoo.com first, then run this seed.';
  end if;

  insert into public.profiles (id, email, display_name)
  values (owner_id, 'princedinesh@yahoo.com', 'Dinesh')
  on conflict (id) do update set
    email = excluded.email,
    display_name = excluded.display_name;

  insert into public.tournaments (name, season_year, sport, status, created_by)
  values ('IPL 2026', 2026, 'Cricket', 'active', owner_id)
  returning id into tournament_id;

  insert into public.matches (
    tournament_id,
    game_number,
    team_a,
    team_b,
    starts_at,
    venue,
    status,
    created_by
  )
  values (
    tournament_id,
    1,
    'Team A',
    'Team B',
    now() + interval '1 day',
    'TBD',
    'scheduled',
    owner_id
  )
  returning id into match_id;

  insert into public.polls (
    tournament_id,
    match_id,
    question,
    option_a,
    option_b,
    locks_at,
    status,
    created_by
  )
  values (
    tournament_id,
    match_id,
    'Team A vs Team B: who will win?',
    'Team A',
    'Team B',
    now() + interval '1 day',
    'open',
    owner_id
  );
end $$;
