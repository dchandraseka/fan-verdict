-- Adds Release 1 private leagues.
-- Run after the base FanVerdict schema and existing tournament/member tables exist.

begin;

create extension if not exists pgcrypto;

create table if not exists public.private_league_blocked_terms (
  term text primary key,
  created_at timestamptz not null default timezone('utc', now())
);

insert into public.private_league_blocked_terms (term)
values
  ('fuck'),
  ('shit'),
  ('bitch'),
  ('asshole'),
  ('bastard'),
  ('dick'),
  ('pussy'),
  ('whore')
on conflict (term) do nothing;

create table if not exists public.private_leagues (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 3 and 80),
  description text check (description is null or char_length(description) <= 500),
  visibility text not null default 'discoverable'
    check (visibility in ('discoverable', 'unlisted')),
  status text not null default 'active'
    check (status in ('active', 'archived')),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists private_leagues_tournament_name_active_key
on public.private_leagues (tournament_id, lower(name))
where status = 'active';

create table if not exists public.private_league_members (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.private_leagues(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member'
    check (role in ('owner', 'admin', 'member')),
  status text not null default 'active'
    check (status in ('invited', 'active', 'removed', 'declined')),
  invited_by uuid references public.profiles(id) on delete set null,
  joined_at timestamptz,
  removed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (league_id, profile_id)
);

create index if not exists private_league_members_profile_id_idx
on public.private_league_members (profile_id);

create table if not exists public.private_league_join_requests (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.private_leagues(id) on delete cascade,
  requester_profile_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  attempt_number integer not null check (attempt_number between 1 and 3),
  request_note text check (request_note is null or char_length(request_note) <= 500),
  review_note text check (review_note is null or char_length(review_note) <= 500),
  reviewed_by_profile_id uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists private_league_join_requests_one_pending_key
on public.private_league_join_requests (league_id, requester_profile_id)
where status = 'pending';

create or replace function public.private_league_text_is_clean(value text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1
    from public.private_league_blocked_terms term
    where term.term <> ''
      and position(lower(term.term) in lower(coalesce(value, ''))) > 0
  );
$$;

create or replace function public.private_league_content_is_clean(league_name text, league_description text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.private_league_text_is_clean(league_name)
    and public.private_league_text_is_clean(league_description);
$$;

create or replace function public.private_league_tournament_id(target_league_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select league.tournament_id
  from public.private_leagues league
  where league.id = target_league_id;
$$;

create or replace function public.is_private_league_member(target_league_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.private_league_members member
    where member.league_id = target_league_id
      and member.profile_id = auth.uid()
      and member.status in ('active', 'invited')
  );
$$;

create or replace function public.is_private_league_admin(target_league_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.private_league_members member
    where member.league_id = target_league_id
      and member.profile_id = auth.uid()
      and member.status = 'active'
      and member.role in ('owner', 'admin')
  );
$$;

create or replace function public.can_read_private_league(target_league_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.private_leagues league
    where league.id = target_league_id
      and league.status = 'active'
      and (
        public.is_private_league_member(league.id)
        or public.is_tournament_admin(league.tournament_id)
        or (
          league.visibility = 'discoverable'
          and public.is_tournament_member(league.tournament_id)
        )
      )
  );
$$;

create or replace function public.set_private_league_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create or replace function public.protect_private_league_identity()
returns trigger
language plpgsql
as $$
begin
  if new.tournament_id <> old.tournament_id then
    raise exception 'Private league tournament cannot be changed.';
  end if;

  if new.created_by <> old.created_by then
    raise exception 'Private league creator cannot be changed.';
  end if;

  return new;
end;
$$;

drop trigger if exists private_leagues_protect_identity on public.private_leagues;
create trigger private_leagues_protect_identity
before update on public.private_leagues
for each row execute function public.protect_private_league_identity();

drop trigger if exists private_leagues_set_updated_at on public.private_leagues;
create trigger private_leagues_set_updated_at
before update on public.private_leagues
for each row execute function public.set_private_league_updated_at();

drop trigger if exists private_league_members_set_updated_at on public.private_league_members;
create trigger private_league_members_set_updated_at
before update on public.private_league_members
for each row execute function public.set_private_league_updated_at();

drop trigger if exists private_league_join_requests_set_updated_at on public.private_league_join_requests;
create trigger private_league_join_requests_set_updated_at
before update on public.private_league_join_requests
for each row execute function public.set_private_league_updated_at();

alter table public.private_league_blocked_terms enable row level security;
alter table public.private_leagues enable row level security;
alter table public.private_league_members enable row level security;
alter table public.private_league_join_requests enable row level security;

drop policy if exists "Tournament admins can read private league blocked terms" on public.private_league_blocked_terms;
create policy "Tournament admins can read private league blocked terms"
on public.private_league_blocked_terms for select
to authenticated
using (exists (select 1 from public.tournament_members tm where tm.user_id = auth.uid() and tm.status = 'active' and tm.role in ('owner', 'admin')));

drop policy if exists "Users can read visible private leagues" on public.private_leagues;
create policy "Users can read visible private leagues"
on public.private_leagues for select
to authenticated
using (public.can_read_private_league(id));

drop policy if exists "Private league admins can update leagues" on public.private_leagues;
create policy "Private league admins can update leagues"
on public.private_leagues for update
to authenticated
using (
  public.is_private_league_admin(id)
  or public.is_tournament_admin(tournament_id)
)
with check (
  (
    public.is_private_league_admin(id)
    or public.is_tournament_admin(tournament_id)
  )
  and public.private_league_content_is_clean(name, description)
);

drop policy if exists "Users can read visible private league members" on public.private_league_members;
create policy "Users can read visible private league members"
on public.private_league_members for select
to authenticated
using (
  profile_id = auth.uid()
  or public.can_read_private_league(league_id)
);

drop policy if exists "Private league admins can update members" on public.private_league_members;

drop policy if exists "Users can read relevant private league requests" on public.private_league_join_requests;
create policy "Users can read relevant private league requests"
on public.private_league_join_requests for select
to authenticated
using (
  requester_profile_id = auth.uid()
  or public.is_private_league_admin(league_id)
  or public.is_tournament_admin(public.private_league_tournament_id(league_id))
);

create or replace function public.create_private_league(
  target_tournament_id uuid,
  league_name text,
  league_description text default null,
  league_visibility text default 'discoverable'
)
returns public.private_leagues
language plpgsql
security definer
set search_path = public
as $$
declare
  created_league public.private_leagues;
  active_created_count integer;
begin
  if auth.uid() is null then
    raise exception 'Sign in before creating a private league.';
  end if;

  if league_visibility not in ('discoverable', 'unlisted') then
    raise exception 'Invalid private league visibility.';
  end if;

  if not public.is_tournament_member(target_tournament_id) then
    raise exception 'Join the tournament before creating a private league.';
  end if;

  if not public.private_league_content_is_clean(league_name, league_description) then
    raise exception 'Private league name or description contains blocked language.';
  end if;

  select count(*)
  into active_created_count
  from public.private_leagues league
  where league.tournament_id = target_tournament_id
    and league.created_by = auth.uid()
    and league.status = 'active';

  if active_created_count >= 2 then
    raise exception 'You can create a maximum of 2 private leagues per tournament.';
  end if;

  insert into public.private_leagues (
    tournament_id,
    name,
    description,
    visibility,
    created_by
  )
  values (
    target_tournament_id,
    trim(league_name),
    nullif(trim(coalesce(league_description, '')), ''),
    league_visibility,
    auth.uid()
  )
  returning * into created_league;

  insert into public.private_league_members (
    league_id,
    profile_id,
    role,
    status,
    joined_at
  )
  values (
    created_league.id,
    auth.uid(),
    'owner',
    'active',
    timezone('utc', now())
  );

  insert into public.audit_log (tournament_id, actor_id, action, details)
  values (
    target_tournament_id,
    auth.uid(),
    'private_league_created',
    jsonb_build_object('league_id', created_league.id, 'league_name', created_league.name)
  );

  return created_league;
end;
$$;

create or replace function public.invite_private_league_member(
  target_league_id uuid,
  target_profile_id uuid
)
returns public.private_league_members
language plpgsql
security definer
set search_path = public
as $$
declare
  target_tournament_id uuid;
  target_league_member public.private_league_members;
begin
  if auth.uid() is null then
    raise exception 'Sign in before inviting members.';
  end if;

  select tournament_id
  into target_tournament_id
  from public.private_leagues
  where id = target_league_id
    and status = 'active';

  if target_tournament_id is null then
    raise exception 'Private league not found.';
  end if;

  if not (
    public.is_private_league_admin(target_league_id)
    or public.is_tournament_admin(target_tournament_id)
  ) then
    raise exception 'Only private league admins can invite members.';
  end if;

  if not exists (
    select 1
    from public.tournament_members member
    where member.tournament_id = target_tournament_id
      and member.user_id = target_profile_id
      and member.status = 'active'
  ) then
    raise exception 'Invitee must already be an active tournament participant in Release 1.';
  end if;

  insert into public.private_league_members (
    league_id,
    profile_id,
    role,
    status,
    invited_by
  )
  values (
    target_league_id,
    target_profile_id,
    'member',
    'invited',
    auth.uid()
  )
  on conflict (league_id, profile_id) do update set
    status = case
      when private_league_members.status = 'active' then 'active'
      else 'invited'
    end,
    invited_by = auth.uid(),
    removed_at = null,
    role = case
      when private_league_members.role = 'owner' then 'owner'
      else 'member'
    end
  returning * into target_league_member;

  insert into public.audit_log (tournament_id, actor_id, action, details)
  values (
    target_tournament_id,
    auth.uid(),
    'private_league_member_invited',
    jsonb_build_object('league_id', target_league_id, 'profile_id', target_profile_id)
  );

  return target_league_member;
end;
$$;

create or replace function public.accept_private_league_invite(target_league_id uuid)
returns public.private_league_members
language plpgsql
security definer
set search_path = public
as $$
declare
  target_tournament_id uuid;
  accepted_member public.private_league_members;
begin
  if auth.uid() is null then
    raise exception 'Sign in before accepting a private league invite.';
  end if;

  select tournament_id
  into target_tournament_id
  from public.private_leagues
  where id = target_league_id
    and status = 'active';

  if target_tournament_id is null then
    raise exception 'Private league not found.';
  end if;

  insert into public.tournament_members (tournament_id, user_id, role, status)
  values (target_tournament_id, auth.uid(), 'participant', 'active')
  on conflict (tournament_id, user_id) do update set
    status = 'active';

  update public.private_league_members
  set status = 'active',
      joined_at = coalesce(joined_at, timezone('utc', now())),
      removed_at = null
  where league_id = target_league_id
    and profile_id = auth.uid()
    and status = 'invited'
  returning * into accepted_member;

  if accepted_member.id is null then
    raise exception 'No pending invite found for this private league.';
  end if;

  insert into public.audit_log (tournament_id, actor_id, action, details)
  values (
    target_tournament_id,
    auth.uid(),
    'private_league_invite_accepted',
    jsonb_build_object('league_id', target_league_id)
  );

  return accepted_member;
end;
$$;

create or replace function public.decline_private_league_invite(target_league_id uuid)
returns public.private_league_members
language plpgsql
security definer
set search_path = public
as $$
declare
  declined_member public.private_league_members;
begin
  if auth.uid() is null then
    raise exception 'Sign in before declining a private league invite.';
  end if;

  update public.private_league_members
  set status = 'declined',
      removed_at = timezone('utc', now())
  where league_id = target_league_id
    and profile_id = auth.uid()
    and status = 'invited'
  returning * into declined_member;

  if declined_member.id is null then
    raise exception 'No pending invite found for this private league.';
  end if;

  return declined_member;
end;
$$;

create or replace function public.request_private_league_join(
  target_league_id uuid,
  request_note text default null
)
returns public.private_league_join_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  target_tournament_id uuid;
  attempts integer;
  created_request public.private_league_join_requests;
begin
  if auth.uid() is null then
    raise exception 'Sign in before requesting to join a private league.';
  end if;

  select tournament_id
  into target_tournament_id
  from public.private_leagues
  where id = target_league_id
    and status = 'active'
    and visibility = 'discoverable';

  if target_tournament_id is null then
    raise exception 'This private league is not open for public join requests.';
  end if;

  if not public.is_tournament_member(target_tournament_id) then
    raise exception 'Join the tournament before requesting a private league.';
  end if;

  if exists (
    select 1
    from public.private_league_members member
    where member.league_id = target_league_id
      and member.profile_id = auth.uid()
      and member.status in ('active', 'invited')
  ) then
    raise exception 'You are already a member or invited member of this private league.';
  end if;

  select count(*)
  into attempts
  from public.private_league_join_requests request
  where request.league_id = target_league_id
    and request.requester_profile_id = auth.uid();

  if attempts >= 3 then
    raise exception 'You can request to join this private league a maximum of 3 times.';
  end if;

  insert into public.private_league_join_requests (
    league_id,
    requester_profile_id,
    attempt_number,
    request_note
  )
  values (
    target_league_id,
    auth.uid(),
    attempts + 1,
    nullif(trim(coalesce(request_note, '')), '')
  )
  returning * into created_request;

  return created_request;
end;
$$;

create or replace function public.review_private_league_join_request(
  target_request_id uuid,
  decision text,
  review_note text default null
)
returns public.private_league_join_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  target_request public.private_league_join_requests;
  target_tournament_id uuid;
  reviewed_request public.private_league_join_requests;
begin
  if auth.uid() is null then
    raise exception 'Sign in before reviewing private league requests.';
  end if;

  if decision not in ('approved', 'rejected') then
    raise exception 'Decision must be approved or rejected.';
  end if;

  select *
  into target_request
  from public.private_league_join_requests
  where id = target_request_id
    and status = 'pending';

  if target_request.id is null then
    raise exception 'Pending join request not found.';
  end if;

  select tournament_id
  into target_tournament_id
  from public.private_leagues
  where id = target_request.league_id
    and status = 'active';

  if not (
    public.is_private_league_admin(target_request.league_id)
    or public.is_tournament_admin(target_tournament_id)
  ) then
    raise exception 'Only private league admins can review join requests.';
  end if;

  update public.private_league_join_requests
  set status = decision,
      review_note = nullif(trim(coalesce(review_note, '')), ''),
      reviewed_by_profile_id = auth.uid(),
      reviewed_at = timezone('utc', now())
  where id = target_request_id
  returning * into reviewed_request;

  if decision = 'approved' then
    insert into public.tournament_members (tournament_id, user_id, role, status)
    values (target_tournament_id, target_request.requester_profile_id, 'participant', 'active')
    on conflict (tournament_id, user_id) do update set
      status = 'active';

    insert into public.private_league_members (
      league_id,
      profile_id,
      role,
      status,
      invited_by,
      joined_at
    )
    values (
      target_request.league_id,
      target_request.requester_profile_id,
      'member',
      'active',
      auth.uid(),
      timezone('utc', now())
    )
    on conflict (league_id, profile_id) do update set
      status = 'active',
      role = case
        when private_league_members.role = 'owner' then 'owner'
        else 'member'
      end,
      joined_at = coalesce(private_league_members.joined_at, timezone('utc', now())),
      removed_at = null;
  end if;

  insert into public.audit_log (tournament_id, actor_id, action, details)
  values (
    target_tournament_id,
    auth.uid(),
    'private_league_join_request_reviewed',
    jsonb_build_object('request_id', target_request_id, 'league_id', target_request.league_id, 'decision', decision)
  );

  return reviewed_request;
end;
$$;

create or replace function public.remove_private_league_member(
  target_league_id uuid,
  target_profile_id uuid
)
returns public.private_league_members
language plpgsql
security definer
set search_path = public
as $$
declare
  target_tournament_id uuid;
  removed_member public.private_league_members;
begin
  if auth.uid() is null then
    raise exception 'Sign in before removing private league members.';
  end if;

  select tournament_id
  into target_tournament_id
  from public.private_leagues
  where id = target_league_id
    and status = 'active';

  if target_tournament_id is null then
    raise exception 'Private league not found.';
  end if;

  if not (
    public.is_private_league_admin(target_league_id)
    or public.is_tournament_admin(target_tournament_id)
  ) then
    raise exception 'Only private league admins can remove members.';
  end if;

  update public.private_league_members
  set status = 'removed',
      removed_at = timezone('utc', now())
  where league_id = target_league_id
    and profile_id = target_profile_id
    and status in ('active', 'invited')
    and role <> 'owner'
  returning * into removed_member;

  if removed_member.id is null then
    raise exception 'Member not found or owner cannot be removed.';
  end if;

  insert into public.audit_log (tournament_id, actor_id, action, details)
  values (
    target_tournament_id,
    auth.uid(),
    'private_league_member_removed',
    jsonb_build_object('league_id', target_league_id, 'profile_id', target_profile_id)
  );

  return removed_member;
end;
$$;

grant execute on function public.create_private_league(uuid, text, text, text) to authenticated;
grant execute on function public.invite_private_league_member(uuid, uuid) to authenticated;
grant execute on function public.accept_private_league_invite(uuid) to authenticated;
grant execute on function public.decline_private_league_invite(uuid) to authenticated;
grant execute on function public.request_private_league_join(uuid, text) to authenticated;
grant execute on function public.review_private_league_join_request(uuid, text, text) to authenticated;
grant execute on function public.remove_private_league_member(uuid, uuid) to authenticated;

commit;
