-- Adds Release 2 email invites for private leagues.
-- Run after supabase/migrate-private-leagues.sql.

begin;

create table if not exists public.private_league_email_invites (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.private_leagues(id) on delete cascade,
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  invited_email text not null
    check (
      invited_email = lower(trim(invited_email))
      and position('@' in invited_email) > 1
      and char_length(invited_email) <= 320
    ),
  token_hash text not null unique,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'revoked', 'expired')),
  invited_by uuid references public.profiles(id) on delete set null,
  accepted_by uuid references public.profiles(id) on delete set null,
  accepted_at timestamptz,
  expires_at timestamptz not null default (timezone('utc', now()) + interval '14 days'),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists private_league_email_invites_league_id_idx
on public.private_league_email_invites (league_id);

create index if not exists private_league_email_invites_tournament_id_idx
on public.private_league_email_invites (tournament_id);

create unique index if not exists private_league_email_invites_one_pending_key
on public.private_league_email_invites (league_id, invited_email)
where status = 'pending';

drop trigger if exists private_league_email_invites_set_updated_at on public.private_league_email_invites;
create trigger private_league_email_invites_set_updated_at
before update on public.private_league_email_invites
for each row execute function public.set_private_league_updated_at();

alter table public.private_league_email_invites enable row level security;

drop policy if exists "Private league admins can read email invites" on public.private_league_email_invites;
create policy "Private league admins can read email invites"
on public.private_league_email_invites for select
to authenticated
using (
  public.is_private_league_admin(league_id)
  or public.is_tournament_admin(tournament_id)
  or invited_by = auth.uid()
  or accepted_by = auth.uid()
);

-- Browser clients should not create, update, or delete email invite rows directly.
-- The Next.js API routes use the service role key so raw tokens and SMTP credentials stay server-side.

commit;
