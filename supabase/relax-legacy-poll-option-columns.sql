-- Allows the dynamic poll-options app code to insert polls without legacy option_a/option_b values.
-- Run this if Supabase reports:
-- null value in column "option_a" of relation "polls" violates not-null constraint

alter table public.polls
alter column option_a drop not null;

alter table public.polls
alter column option_b drop not null;
