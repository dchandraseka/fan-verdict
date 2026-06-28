-- FanVerdict application reset.
-- Run this in the Supabase SQL editor when you are ready to wipe app data.
-- It drops and recreates only the public app tables; Supabase auth users are kept.

begin;

create extension if not exists pgcrypto;

drop trigger if exists on_auth_user_created on auth.users;

drop table if exists public.audit_log cascade;
drop table if exists public.reminder_deliveries cascade;
drop table if exists public.tournament_announcements cascade;
drop table if exists public.points_ledger cascade;
drop table if exists public.votes cascade;
drop table if exists public.poll_options cascade;
drop table if exists public.polls cascade;
drop table if exists public.matches cascade;
drop table if exists public.tournament_members cascade;
drop table if exists public.tournaments cascade;
drop table if exists public.profiles cascade;

drop function if exists public.handle_new_user() cascade;
drop function if exists public.add_tournament_owner() cascade;
drop function if exists public.set_updated_at() cascade;
drop function if exists public.is_tournament_member(uuid) cascade;
drop function if exists public.is_tournament_admin(uuid) cascade;
drop function if exists public.is_tournament_owner(uuid) cascade;
drop function if exists public.poll_tournament_id(uuid) cascade;
drop function if exists public.poll_is_open(uuid) cascade;
drop function if exists public.poll_option_belongs_to_poll(uuid, uuid) cascade;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  email text,
  avatar_path text,
  whatsapp_number text,
  notification_channel text not null default 'email'
    check (notification_channel in ('email', 'none')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.tournaments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  season_year integer,
  sport text not null default 'Cricket',
  status text not null default 'active'
    check (status in ('draft', 'active', 'completed', 'archived')),
  starts_on date,
  ends_on date,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.tournament_members (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'participant'
    check (role in ('owner', 'admin', 'participant')),
  status text not null default 'active'
    check (status in ('invited', 'active', 'removed')),
  joined_at timestamptz not null default timezone('utc', now()),
  unique (tournament_id, user_id)
);

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  game_number integer,
  source_ref text,
  team_a text not null,
  team_b text not null,
  starts_at timestamptz not null,
  venue text,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'live', 'completed', 'cancelled')),
  winner_team text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (tournament_id, game_number)
);

create table public.polls (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  match_id uuid references public.matches(id) on delete cascade,
  question text not null,
  opens_at timestamptz not null default timezone('utc', now()),
  locks_at timestamptz not null,
  status text not null default 'open'
    check (status in ('draft', 'open', 'locked', 'settled', 'cancelled')),
  result_option_id uuid,
  points_per_correct integer not null default 1 check (points_per_correct > 0),
  created_by uuid references public.profiles(id) on delete set null,
  settled_by uuid references public.profiles(id) on delete set null,
  settled_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls(id) on delete cascade,
  label text not null,
  sort_order integer not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (poll_id, sort_order)
);

create table public.votes (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  selected_option_id uuid not null references public.poll_options(id) on delete restrict,
  voted_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (poll_id, user_id)
);

create table public.points_ledger (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  poll_id uuid references public.polls(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  delta integer not null,
  reason text not null check (reason in ('correct_pick', 'manual_adjustment', 'historical_import')),
  note text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid references public.tournaments(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table public.reminder_deliveries (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  reminder_date date not null,
  channel text not null default 'email' check (channel = 'email'),
  delivery_status text not null default 'pending'
    check (delivery_status in ('pending', 'sent', 'failed')),
  email text,
  open_poll_count integer not null default 0 check (open_poll_count >= 0),
  sent_at timestamptz,
  error_message text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (tournament_id, profile_id, reminder_date, channel)
);

create table public.tournament_announcements (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 120),
  body text not null check (char_length(trim(body)) between 1 and 1200),
  status text not null default 'active' check (status in ('active', 'removed')),
  created_by uuid references public.profiles(id) on delete set null,
  removed_by uuid references public.profiles(id) on delete set null,
  removed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index tournament_announcements_one_active_per_tournament
on public.tournament_announcements (tournament_id)
where status = 'active';

create index tournament_announcements_tournament_created_idx
on public.tournament_announcements (tournament_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger tournaments_set_updated_at
before update on public.tournaments
for each row execute function public.set_updated_at();

create trigger matches_set_updated_at
before update on public.matches
for each row execute function public.set_updated_at();

create trigger polls_set_updated_at
before update on public.polls
for each row execute function public.set_updated_at();

create trigger poll_options_set_updated_at
before update on public.poll_options
for each row execute function public.set_updated_at();

create trigger votes_set_updated_at
before update on public.votes
for each row execute function public.set_updated_at();

create trigger reminder_deliveries_set_updated_at
before update on public.reminder_deliveries
for each row execute function public.set_updated_at();

create trigger tournament_announcements_set_updated_at
before update on public.tournament_announcements
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id,
    email,
    display_name,
    whatsapp_number,
    notification_channel
  )
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data->>'display_name',
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      split_part(new.email, '@', 1),
      'Fan'
    ),
    new.raw_user_meta_data->>'whatsapp_number',
    case
      when new.raw_user_meta_data->>'notification_channel' = 'none' then 'none'
      else 'email'
    end
  )
  on conflict (id) do update set
    email = excluded.email,
    updated_at = timezone('utc', now());

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.add_tournament_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.tournament_members (tournament_id, user_id, role, status)
  values (new.id, new.created_by, 'owner', 'active')
  on conflict (tournament_id, user_id) do update set
    role = 'owner',
    status = 'active';

  return new;
end;
$$;

create trigger tournaments_add_owner
after insert on public.tournaments
for each row execute function public.add_tournament_owner();

create or replace function public.is_tournament_member(target_tournament_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tournament_members tm
    where tm.tournament_id = target_tournament_id
      and tm.user_id = auth.uid()
      and tm.status = 'active'
  );
$$;

create or replace function public.is_tournament_admin(target_tournament_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tournament_members tm
    where tm.tournament_id = target_tournament_id
      and tm.user_id = auth.uid()
      and tm.status = 'active'
      and tm.role in ('owner', 'admin')
  );
$$;

create or replace function public.is_tournament_owner(target_tournament_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tournament_members tm
    where tm.tournament_id = target_tournament_id
      and tm.user_id = auth.uid()
      and tm.status = 'active'
      and tm.role = 'owner'
  );
$$;

create or replace function public.poll_tournament_id(target_poll_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.tournament_id
  from public.polls p
  where p.id = target_poll_id;
$$;

create or replace function public.poll_is_open(target_poll_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.polls p
    where p.id = target_poll_id
      and p.status = 'open'
      and p.opens_at <= now()
      and p.locks_at > now()
  );
$$;

create or replace function public.poll_option_belongs_to_poll(target_poll_id uuid, target_option_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.poll_options po
    where po.poll_id = target_poll_id
      and po.id = target_option_id
  );
$$;

alter table public.profiles enable row level security;
alter table public.tournaments enable row level security;
alter table public.tournament_members enable row level security;
alter table public.matches enable row level security;
alter table public.polls enable row level security;
alter table public.poll_options enable row level security;
alter table public.votes enable row level security;
alter table public.points_ledger enable row level security;
alter table public.audit_log enable row level security;
alter table public.reminder_deliveries enable row level security;
alter table public.tournament_announcements enable row level security;

create policy "Authenticated users can read profiles"
on public.profiles for select
to authenticated
using (true);

create policy "Users can insert their profile"
on public.profiles for insert
to authenticated
with check (id = auth.uid());

create policy "Users can update their profile"
on public.profiles for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'profile-photos',
  'profile-photos',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can view profile photos" on storage.objects;
create policy "Public can view profile photos"
on storage.objects for select
to public
using (bucket_id = 'profile-photos');

drop policy if exists "Users can upload their profile photos" on storage.objects;
create policy "Users can upload their profile photos"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can replace their profile photos" on storage.objects;
create policy "Users can replace their profile photos"
on storage.objects for update
to authenticated
using (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can delete their profile photos" on storage.objects;
create policy "Users can delete their profile photos"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Authenticated users can read tournaments"
on public.tournaments for select
to authenticated
using (true);

create policy "Authenticated users can create tournaments"
on public.tournaments for insert
to authenticated
with check (created_by = auth.uid());

create policy "Admins can update tournaments"
on public.tournaments for update
to authenticated
using (public.is_tournament_admin(id))
with check (public.is_tournament_admin(id));

create policy "Owners can delete tournaments"
on public.tournaments for delete
to authenticated
using (public.is_tournament_owner(id));

create policy "Members can read tournament announcements"
on public.tournament_announcements for select
to authenticated
using (public.is_tournament_member(tournament_id));

create policy "Admins can create tournament announcements"
on public.tournament_announcements for insert
to authenticated
with check (
  created_by = auth.uid()
  and public.is_tournament_admin(tournament_id)
);

create policy "Admins can update tournament announcements"
on public.tournament_announcements for update
to authenticated
using (public.is_tournament_admin(tournament_id))
with check (public.is_tournament_admin(tournament_id));

create policy "Authenticated users can read members"
on public.tournament_members for select
to authenticated
using (true);

create policy "Users can join tournaments as participants"
on public.tournament_members for insert
to authenticated
with check (
  user_id = auth.uid()
  and role = 'participant'
  and status = 'active'
);

create policy "Admins can add members"
on public.tournament_members for insert
to authenticated
with check (public.is_tournament_admin(tournament_id));

create policy "Admins can update members"
on public.tournament_members for update
to authenticated
using (public.is_tournament_admin(tournament_id))
with check (public.is_tournament_admin(tournament_id));

create policy "Admins can remove members"
on public.tournament_members for delete
to authenticated
using (public.is_tournament_admin(tournament_id));

create policy "Members can read matches"
on public.matches for select
to authenticated
using (public.is_tournament_member(tournament_id));

create policy "Admins can manage matches"
on public.matches for all
to authenticated
using (public.is_tournament_admin(tournament_id))
with check (public.is_tournament_admin(tournament_id));

create policy "Members can read polls"
on public.polls for select
to authenticated
using (public.is_tournament_member(tournament_id));

create policy "Admins can manage polls"
on public.polls for all
to authenticated
using (public.is_tournament_admin(tournament_id))
with check (public.is_tournament_admin(tournament_id));

create policy "Members can read poll options"
on public.poll_options for select
to authenticated
using (public.is_tournament_member(public.poll_tournament_id(poll_id)));

create policy "Admins can manage poll options"
on public.poll_options for all
to authenticated
using (public.is_tournament_admin(public.poll_tournament_id(poll_id)))
with check (public.is_tournament_admin(public.poll_tournament_id(poll_id)));

create policy "Members can read votes"
on public.votes for select
to authenticated
using (public.is_tournament_member(public.poll_tournament_id(poll_id)));

create policy "Members can vote before lock"
on public.votes for insert
to authenticated
with check (
  user_id = auth.uid()
  and public.is_tournament_member(public.poll_tournament_id(poll_id))
  and public.poll_is_open(poll_id)
  and public.poll_option_belongs_to_poll(poll_id, selected_option_id)
);

create policy "Members can change votes before lock"
on public.votes for update
to authenticated
using (
  user_id = auth.uid()
  and public.is_tournament_member(public.poll_tournament_id(poll_id))
  and public.poll_is_open(poll_id)
  and public.poll_option_belongs_to_poll(poll_id, selected_option_id)
)
with check (
  user_id = auth.uid()
  and public.is_tournament_member(public.poll_tournament_id(poll_id))
  and public.poll_is_open(poll_id)
  and public.poll_option_belongs_to_poll(poll_id, selected_option_id)
);

create policy "Members can read ledger"
on public.points_ledger for select
to authenticated
using (public.is_tournament_member(tournament_id));

create policy "Admins can insert ledger"
on public.points_ledger for insert
to authenticated
with check (public.is_tournament_admin(tournament_id));

create policy "Admins can delete ledger"
on public.points_ledger for delete
to authenticated
using (public.is_tournament_admin(tournament_id));

create policy "Admins can read audit log"
on public.audit_log for select
to authenticated
using (public.is_tournament_admin(tournament_id));

create policy "Admins can insert audit log"
on public.audit_log for insert
to authenticated
with check (
  tournament_id is null
  or public.is_tournament_admin(tournament_id)
);

create policy "Admins can read reminder deliveries"
on public.reminder_deliveries for select
to authenticated
using (public.is_tournament_admin(tournament_id));

commit;
