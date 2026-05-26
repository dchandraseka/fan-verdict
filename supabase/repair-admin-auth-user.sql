-- Repairs a manually inserted Supabase Auth user so password login can work.
-- Run this if login fails with: Database error querying schema.

do $$
declare
  admin_email text := 'princedinesh@yahoo.com';
  admin_user_id uuid;
begin
  select id
    into admin_user_id
  from auth.users
  where lower(email) = lower(admin_email)
  limit 1;

  if admin_user_id is null then
    raise exception 'Auth user not found for %', admin_email;
  end if;

  update auth.users
  set
    confirmation_token = coalesce(confirmation_token, ''),
    recovery_token = coalesce(recovery_token, ''),
    email_change = coalesce(email_change, ''),
    email_change_token_new = coalesce(email_change_token_new, ''),
    email_change_token_current = coalesce(email_change_token_current, ''),
    phone_change = coalesce(phone_change, ''),
    phone_change_token = coalesce(phone_change_token, ''),
    reauthentication_token = coalesce(reauthentication_token, ''),
    email_confirmed_at = coalesce(email_confirmed_at, now()),
    raw_app_meta_data = coalesce(
      raw_app_meta_data,
      jsonb_build_object('provider', 'email', 'providers', array['email'])
    ),
    raw_user_meta_data = coalesce(
      raw_user_meta_data,
      jsonb_build_object('display_name', 'Dinesh', 'notification_channel', 'email')
    ),
    updated_at = now()
  where id = admin_user_id;

  insert into auth.identities (
    id,
    user_id,
    provider_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at
  )
  values (
    gen_random_uuid(),
    admin_user_id,
    admin_user_id::text,
    jsonb_build_object(
      'sub', admin_user_id::text,
      'email', admin_email,
      'email_verified', true,
      'phone_verified', false
    ),
    'email',
    now(),
    now(),
    now()
  )
  on conflict (provider_id, provider) do update set
    user_id = excluded.user_id,
    identity_data = excluded.identity_data,
    updated_at = now();
end $$;
