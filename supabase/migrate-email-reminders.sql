-- Supports email-only daily vote reminders and explicit reminder opt-out.

begin;

update public.profiles
set notification_channel = 'email'
where notification_channel in ('phone', 'both', 'whatsapp')
   or notification_channel is null;

alter table public.profiles
alter column notification_channel set default 'email';

alter table public.profiles
drop constraint if exists profiles_notification_channel_check;

alter table public.profiles
add constraint profiles_notification_channel_check
check (notification_channel in ('email', 'none'));

create table if not exists public.reminder_deliveries (
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

drop trigger if exists reminder_deliveries_set_updated_at on public.reminder_deliveries;
create trigger reminder_deliveries_set_updated_at
before update on public.reminder_deliveries
for each row execute function public.set_updated_at();

alter table public.reminder_deliveries enable row level security;

drop policy if exists "Admins can read reminder deliveries" on public.reminder_deliveries;
create policy "Admins can read reminder deliveries"
on public.reminder_deliveries for select
to authenticated
using (public.is_tournament_admin(tournament_id));

commit;
