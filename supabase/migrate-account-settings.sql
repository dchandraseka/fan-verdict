-- Supports Account Settings communication preferences.
-- FanVerdict currently supports email reminders or explicit opt-out.

update public.profiles
set notification_channel = 'email'
where notification_channel in ('phone', 'both', 'whatsapp')
   or notification_channel is null;

alter table public.profiles
drop constraint if exists profiles_notification_channel_check;

alter table public.profiles
add constraint profiles_notification_channel_check
check (notification_channel in ('email', 'none'));
