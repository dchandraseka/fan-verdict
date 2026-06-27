# FanVerdict

Last source review: June 27, 2026

FanVerdict is a tournament prediction app for running match polls, locking votes at game time, calculating points, managing private groups, and sharing live or historical standings.

## Current Features

### Accounts And Profiles

- Supabase Auth sign-up and sign-in with email/password.
- Forgot-password and reset-password flow through `/reset-password`.
- Redirect-aware login so invite links can return users to the right tournament or private league after sign-in.
- Sign-up captures display name, optional phone/WhatsApp number, and reminder preference.
- Account settings for display name, optional phone/WhatsApp number, email reminder opt-in/opt-out, and password changes.
- Profile photo upload, replacement, and removal through the Supabase `profile-photos` storage bucket.

### Tournament Dashboard

- Tournament picker for live tournaments and imported historical tournaments.
- Live tournament dashboard with main-menu shortcuts for player standings, Player Matrix, open polls, settled polls, results-vs-voting summary, private leagues, and vote audit log.
- Player standings link each player to a separate point-detail page with per-game picks, results, points, and ledger entries, plus a back link to the same tournament standings.
- Player Matrix view below player standings and above open polls showing each player's settled-poll points by game, tournament total, accuracy, winning-voter counts, and majority/minority result rows.
- Historical tournament dashboard with historical standings, event summaries, claimed/unclaimed profile counts, and bonus-result summary.
- Browser share, WhatsApp, and email sharing links for the dashboard.
- Members can join tournaments as participants.

### Polls And Voting

- Match polls with game number, teams, venue, poll question, options, and lock time.
- Manual polls inside a tournament.
- Polls can have two or more dynamic options.
- Vote changes are allowed until the poll lock time.
- Open and settled poll views show vote counts, option breakdowns, voters by option, and participants who have not voted.
- Results-vs-voting compares final results against majority, minority, and no-correct-pick outcomes.

### Admin Tools

- Tournament creation; the creator is automatically added as owner.
- Tournament membership with participant, admin, and owner roles.
- Admin creation of match polls and manual polls.
- Optional tie/default extra option support for tournaments such as FIFA/World Cup style polls.
- Admin correction of poll question, option names, venue, and lock time before a poll locks.
- Admin result settlement with configurable points per correct vote.
- Manual point adjustments through `points_ledger`.
- Co-admin promotion for active tournament participants.
- Historical profile claim review for app admins.
- Vote/result actions are recorded in `audit_log`.

### Private Leagues

- Participants can create private leagues inside a tournament.
- League visibility can be discoverable or unlisted.
- Each participant can create up to two active private leagues per tournament.
- Private league owners/admins can invite existing tournament participants.
- Private league owners/admins can invite friends by email with 14-day tokenized invite links.
- Invite acceptance automatically ensures the user's profile, tournament membership, and private league membership.
- Discoverable private leagues support join requests with a three-attempt limit.
- Private league admins can approve/reject join requests and remove members.
- Private league standings can be shared or exported as CSV.

### Reminders And Email

- Daily email reminders for tournament members with uncast picks.
- Reminder delivery is deduplicated per member, tournament, date, and channel.
- Gmail SMTP is used for daily reminders and private league email invites.

### Historical Data

- Historical scorebook schema for participants, tournaments, events, event scores, and bonus votes.
- Historical standings and event-summary views.
- Historical profile claim request flow for users.
- App-admin review flow for approving or rejecting historical profile claims.
- Historical imports can feed `points_ledger` with the `historical_import` reason.

## GitHub and Vercel Setup

This project is intended to be pushed to GitHub and built by Vercel.

1. The working copy currently lives at `G:\My Drive\fan-verdict`. G drive is only for storage. Any install should be done only in local machine. Deployment should come from GitHub, not from Drive sync.
2. Dinesh commits changes manually through VS Code/Git.
3. Vercel builds automatically from the GitHub repository.
4. Do not commit `.env.local`, API key files, recovery codes, or other local secrets.

In Vercel, add these environment variables:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
GMAIL_USER=your-gmail-address
GMAIL_APP_PASSWORD=your-gmail-app-password
CRON_SECRET=use-a-long-random-secret
NEXT_PUBLIC_APP_URL=https://your-vercel-app.vercel.app
REMINDER_TIME_ZONE=America/New_York
```

`REMINDER_TIME_ZONE` is optional. If omitted, reminder code defaults to the configured app behavior.

In Supabase Auth settings, add your Vercel URL to the allowed URLs:

```text
https://your-vercel-app.vercel.app
https://your-vercel-app.vercel.app/**
```

Set the Supabase Auth Site URL to the production Vercel URL as well. If it is
left as `http://localhost:3000`, email confirmation and password reset links can
send users to localhost.

Build settings in Vercel can stay at the defaults for Next.js:

```text
Install Command: npm install
Build Command: npm run build
Output Directory: .next
```

The cron route is `/api/cron/daily-reminders`. `vercel.json` schedules it daily at 11:00 UTC, which is 7:00 AM New York time during daylight saving time and 6:00 AM New York time during standard time.

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Create `.env.local` from the same values used in Vercel, with a local app URL:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
GMAIL_USER=your-gmail-address
GMAIL_APP_PASSWORD=your-gmail-app-password
CRON_SECRET=use-a-long-random-secret
NEXT_PUBLIC_APP_URL=http://localhost:3000
REMINDER_TIME_ZONE=America/New_York
```

3. Reset/create the Supabase app schema by running `supabase/reset.sql` in the Supabase SQL editor.

4. Run needed migrations for existing databases. Use the SQL files that match the features being enabled:

- `supabase/migrate-dynamic-poll-options.sql`
- `supabase/relax-legacy-poll-option-columns.sql`
- `supabase/migrate-account-settings.sql`
- `supabase/migrate-email-reminders.sql`
- `supabase/migrate-profile-photos.sql`
- `supabase/migrate-historical-score-import.sql`
- `supabase/migrate-historical-claim-requests.sql`
- `supabase/migrate-private-leagues.sql`
- `supabase/migrate-private-league-email-invites.sql`

5. Optional data load/helper scripts:

- `supabase/import-historical-ipl-scorebooks.sql`
- `supabase/sync-fifa-2026-games-1-12-poll-format.sql`
- `supabase/create-fifa-2026-group-stage-games-13-72.sql`
- `supabase/check-dynamic-poll-schema.sql`

6. Start the app:

```bash
npm run dev
```

## Supabase Notes

`supabase/reset.sql` drops and recreates the base public application tables. It does not delete Supabase Auth users. Some later features are layered through migration scripts rather than being fully represented by the original reset flow.

Core application tables:

- `profiles`
- `tournaments`
- `tournament_members`
- `matches`
- `polls`
- `poll_options`
- `votes`
- `points_ledger`
- `audit_log`
- `reminder_deliveries`

Private league tables:

- `private_league_blocked_terms`
- `private_leagues`
- `private_league_members`
- `private_league_join_requests`
- `private_league_email_invites`

Historical data tables and views:

- `historical_participants`
- `historical_tournaments`
- `historical_tournament_participants`
- `historical_events`
- `historical_event_scores`
- `historical_bonus_votes`
- `historical_claim_requests`
- `historical_standings`
- `historical_event_summary`

Admin/support objects:

- `app_admins`
- Supabase Storage bucket: `profile-photos`

Points are recorded in `points_ledger` instead of being stored only as a mutable total. This keeps match scoring, manual adjustments, and historical imports auditable.

Important RPC/function areas:

- Tournament membership and admin checks.
- Poll lock and option-validation checks.
- Historical profile claim request/review.
- Private league creation, invites, join requests, request review, and member removal.

## Later Work

- Schedule import from a cricket data source.
- Automated result sync.
- WhatsApp or push notification reminders.
- Account deletion and privacy policy readiness for app-store submission.
- PWA polish before native Android/iOS packaging.
- Server-side scoring RPC or route for transactional settlement.
