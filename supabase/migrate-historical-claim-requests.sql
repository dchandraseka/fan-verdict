-- Adds app-admin guarded profile claim requests for historical participants.

begin;

create table if not exists public.app_admins (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  granted_by uuid references public.profiles(id) on delete set null,
  note text,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.historical_claim_requests (
  id uuid primary key default gen_random_uuid(),
  historical_participant_id uuid not null references public.historical_participants(id) on delete cascade,
  requester_profile_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  request_note text,
  review_note text,
  reviewed_by_profile_id uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists historical_claim_requests_pending_requester_idx
on public.historical_claim_requests (requester_profile_id)
where status = 'pending';

create index if not exists historical_claim_requests_participant_idx
on public.historical_claim_requests (historical_participant_id, status);

create index if not exists historical_claim_requests_status_idx
on public.historical_claim_requests (status, created_at);

drop trigger if exists historical_claim_requests_set_updated_at on public.historical_claim_requests;
create trigger historical_claim_requests_set_updated_at
before update on public.historical_claim_requests
for each row execute function public.set_updated_at();

create or replace function public.is_app_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.app_admins aa
    where aa.profile_id = auth.uid()
  );
$$;

create or replace function public.request_historical_claim(target_historical_participant_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  created_request_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in before requesting a profile claim.';
  end if;

  if exists (
    select 1
    from public.historical_participants hp
    where hp.claimed_profile_id = auth.uid()
  ) then
    raise exception 'Your account is already linked to a historical profile.';
  end if;

  if not exists (
    select 1
    from public.historical_participants hp
    where hp.id = target_historical_participant_id
      and hp.claimed_profile_id is null
      and hp.claim_status = 'unclaimed'
  ) then
    raise exception 'This historical profile is not available to claim.';
  end if;

  select hcr.id
  into created_request_id
  from public.historical_claim_requests hcr
  where hcr.requester_profile_id = auth.uid()
    and hcr.status = 'pending'
  limit 1;

  if created_request_id is not null then
    return created_request_id;
  end if;

  insert into public.historical_claim_requests (
    historical_participant_id,
    requester_profile_id,
    status
  )
  values (
    target_historical_participant_id,
    auth.uid(),
    'pending'
  )
  returning id into created_request_id;

  return created_request_id;
end;
$$;

create or replace function public.review_historical_claim_request(
  target_request_id uuid,
  approve_request boolean,
  review_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  claim_request public.historical_claim_requests%rowtype;
begin
  if not public.is_app_admin() then
    raise exception 'Only app admins can review profile claims.';
  end if;

  select *
  into claim_request
  from public.historical_claim_requests hcr
  where hcr.id = target_request_id
  for update;

  if claim_request.id is null then
    raise exception 'Claim request not found.';
  end if;

  if claim_request.status <> 'pending' then
    raise exception 'This claim request has already been reviewed.';
  end if;

  if approve_request then
    if exists (
      select 1
      from public.historical_participants hp
      where hp.id = claim_request.historical_participant_id
        and hp.claimed_profile_id is not null
    ) then
      raise exception 'This historical profile has already been claimed.';
    end if;

    if exists (
      select 1
      from public.historical_participants hp
      where hp.claimed_profile_id = claim_request.requester_profile_id
    ) then
      raise exception 'The requester is already linked to a historical profile.';
    end if;

    update public.historical_participants
    set claimed_profile_id = claim_request.requester_profile_id,
        claim_status = 'claimed'
    where id = claim_request.historical_participant_id;

    update public.historical_claim_requests
    set status = 'approved',
        review_note = coalesce(review_historical_claim_request.review_note, 'Approved'),
        reviewed_by_profile_id = auth.uid(),
        reviewed_at = timezone('utc', now())
    where id = claim_request.id;

    update public.historical_claim_requests
    set status = 'rejected',
        review_note = 'Another claim request for this profile was approved.',
        reviewed_by_profile_id = auth.uid(),
        reviewed_at = timezone('utc', now())
    where historical_participant_id = claim_request.historical_participant_id
      and status = 'pending'
      and id <> claim_request.id;
  else
    update public.historical_claim_requests
    set status = 'rejected',
        review_note = coalesce(review_historical_claim_request.review_note, 'Rejected'),
        reviewed_by_profile_id = auth.uid(),
        reviewed_at = timezone('utc', now())
    where id = claim_request.id;
  end if;
end;
$$;

alter table public.app_admins enable row level security;
alter table public.historical_claim_requests enable row level security;

drop policy if exists "Users can read their app admin grant" on public.app_admins;
create policy "Users can read their app admin grant"
on public.app_admins for select
to authenticated
using (profile_id = auth.uid());

drop policy if exists "Users and app admins can read claim requests" on public.historical_claim_requests;
create policy "Users and app admins can read claim requests"
on public.historical_claim_requests for select
to authenticated
using (
  requester_profile_id = auth.uid()
  or public.is_app_admin()
);

grant execute on function public.is_app_admin() to authenticated;
grant execute on function public.request_historical_claim(uuid) to authenticated;
grant execute on function public.review_historical_claim_request(uuid, boolean, text) to authenticated;

insert into public.app_admins (profile_id, note)
select hp.claimed_profile_id, 'Seeded from existing historical profile claim.'
from public.historical_participants hp
where hp.normalized_name in ('dinesh', 'krishna')
  and hp.claimed_profile_id is not null
on conflict (profile_id) do nothing;

commit;

