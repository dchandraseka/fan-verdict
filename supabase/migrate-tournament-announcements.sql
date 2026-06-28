-- Adds tournament dashboard announcements managed by tournament admins.
-- Active announcements appear near the top of the main dashboard until removed.
-- Removed announcements are retained for admin history.

begin;

create table if not exists public.tournament_announcements (
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

create unique index if not exists tournament_announcements_one_active_per_tournament
on public.tournament_announcements (tournament_id)
where status = 'active';

create index if not exists tournament_announcements_tournament_created_idx
on public.tournament_announcements (tournament_id, created_at desc);

drop trigger if exists tournament_announcements_set_updated_at on public.tournament_announcements;
create trigger tournament_announcements_set_updated_at
before update on public.tournament_announcements
for each row execute function public.set_updated_at();

alter table public.tournament_announcements enable row level security;

drop policy if exists "Members can read tournament announcements" on public.tournament_announcements;
create policy "Members can read tournament announcements"
on public.tournament_announcements for select
to authenticated
using (public.is_tournament_member(tournament_id));

drop policy if exists "Admins can create tournament announcements" on public.tournament_announcements;
create policy "Admins can create tournament announcements"
on public.tournament_announcements for insert
to authenticated
with check (
  created_by = auth.uid()
  and public.is_tournament_admin(tournament_id)
);

drop policy if exists "Admins can update tournament announcements" on public.tournament_announcements;
create policy "Admins can update tournament announcements"
on public.tournament_announcements for update
to authenticated
using (public.is_tournament_admin(tournament_id))
with check (public.is_tournament_admin(tournament_id));

commit;
