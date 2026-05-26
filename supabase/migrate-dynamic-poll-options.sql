-- Migrates the original two-option poll schema to dynamic poll options.
-- Run this once in Supabase SQL Editor before deploying the matching app code.

begin;

create table if not exists public.poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls(id) on delete cascade,
  label text not null,
  sort_order integer not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (poll_id, sort_order)
);

alter table public.polls
add column if not exists result_option_id uuid;

alter table public.polls
add column if not exists points_per_correct integer not null default 1;

alter table public.votes
add column if not exists selected_option_id uuid;

alter table public.polls
alter column option_a drop not null;

alter table public.polls
alter column option_b drop not null;

insert into public.poll_options (poll_id, label, sort_order)
select p.id, p.option_a, 1
from public.polls p
where p.option_a is not null
  and not exists (
    select 1
    from public.poll_options po
    where po.poll_id = p.id
      and po.sort_order = 1
  );

insert into public.poll_options (poll_id, label, sort_order)
select p.id, p.option_b, 2
from public.polls p
where p.option_b is not null
  and not exists (
    select 1
    from public.poll_options po
    where po.poll_id = p.id
      and po.sort_order = 2
  );

update public.votes v
set selected_option_id = po.id
from public.poll_options po
where po.poll_id = v.poll_id
  and (
    (v.selected_option = 'option_a' and po.sort_order = 1)
    or (v.selected_option = 'option_b' and po.sort_order = 2)
  )
  and v.selected_option_id is null;

update public.polls p
set result_option_id = po.id
from public.poll_options po
where po.poll_id = p.id
  and (
    (p.result_option = 'option_a' and po.sort_order = 1)
    or (p.result_option = 'option_b' and po.sort_order = 2)
  )
  and p.result_option_id is null;

alter table public.votes
alter column selected_option drop not null;

alter table public.votes
drop constraint if exists votes_selected_option_check;

alter table public.votes
alter column selected_option_id set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'votes_selected_option_id_fkey'
  ) then
    alter table public.votes
    add constraint votes_selected_option_id_fkey
    foreign key (selected_option_id) references public.poll_options(id) on delete restrict;
  end if;
end $$;

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

drop trigger if exists poll_options_set_updated_at on public.poll_options;

create trigger poll_options_set_updated_at
before update on public.poll_options
for each row execute function public.set_updated_at();

alter table public.poll_options enable row level security;

drop policy if exists "Members can read poll options" on public.poll_options;
drop policy if exists "Admins can manage poll options" on public.poll_options;

create policy "Members can read poll options"
on public.poll_options for select
to authenticated
using (public.is_tournament_member(public.poll_tournament_id(poll_id)));

create policy "Admins can manage poll options"
on public.poll_options for all
to authenticated
using (public.is_tournament_admin(public.poll_tournament_id(poll_id)))
with check (public.is_tournament_admin(public.poll_tournament_id(poll_id)));

drop policy if exists "Members can vote before lock" on public.votes;
drop policy if exists "Members can change votes before lock" on public.votes;

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

commit;
