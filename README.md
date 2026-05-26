# FanVerdict

FanVerdict is a tournament prediction app for running match polls, locking votes at game time, calculating points, and sharing a leaderboard.

## Current Features

- Supabase Auth sign-up/sign-in with email/password plus Google and Facebook OAuth hooks.
- Tournament creation; the creator is automatically added as owner.
- Tournament membership with participant, admin, and owner roles.
- Match polls with team options and a lock time.
- Manual polls inside a tournament.
- Polls can have two or more options.
- Vote changes until the poll lock time.
- Admin result settlement with configurable points per correct vote.
- Admin correction of poll questions, option names, venue, and lock time before a poll locks.
- Account settings for password changes, phone number, and email/phone/both alert preference.
- Manual point adjustments through a ledger.
- Vote audit log with participant, selected option, and timestamp.
- Dashboard sharing links for browser share, WhatsApp, and email.

## GitHub and Vercel Setup

This project is intended to be pushed to GitHub and built by Vercel.

1. Push the repository to GitHub.

2. In Vercel, add these environment variables to the project:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
```

3. In Supabase Auth settings, add your Vercel URL to the allowed URLs:

```text
https://your-vercel-app.vercel.app
https://your-vercel-app.vercel.app/**
```

Set the Supabase Auth Site URL to the production Vercel URL as well. If it is
left as `http://localhost:3000`, email confirmation and password reset links can
send users to localhost.

4. If you use Google or Facebook sign-in, configure those providers in Supabase Auth and their provider dashboards.

5. Build settings in Vercel can stay at the defaults for Next.js:

```text
Install Command: npm install
Build Command: npm run build
Output Directory: .next
```

If the database was created with the original two-option prototype, run
`supabase/migrate-dynamic-poll-options.sql` in the Supabase SQL Editor before
deploying this code.

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Create `.env.local` from `.env.local.example`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
```

3. Reset/create the Supabase app schema by running `supabase/reset.sql` in the Supabase SQL editor.

4. Start the app:

```bash
npm run dev
```

## Supabase Notes

`supabase/reset.sql` drops and recreates the public application tables. It does not delete Supabase Auth users.

The core tables are:

- `profiles`
- `tournaments`
- `tournament_members`
- `matches`
- `polls`
- `poll_options`
- `votes`
- `points_ledger`
- `audit_log`

Points are recorded in `points_ledger` instead of being stored only as a mutable total. This keeps match scoring, manual adjustments, and future historical imports auditable.

## Later Work

- Schedule import from a cricket data source.
- Automated result sync.
- WhatsApp/email reminder jobs.
- Historical Google Sheet import.
- Server-side scoring RPC or route for transactional settlement.
