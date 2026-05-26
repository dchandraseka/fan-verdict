-- Supports Account Settings communication preferences.
-- Existing "whatsapp" values are kept for compatibility; the UI now writes "phone".

alter table public.profiles
drop constraint if exists profiles_notification_channel_check;

alter table public.profiles
add constraint profiles_notification_channel_check
check (notification_channel in ('email', 'phone', 'both', 'whatsapp'));
