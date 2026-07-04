# FIFA 2026 Knockout Upload Status

Last checked: 2026-07-03

Official source:
https://api.fifa.com/api/v3/calendar/matches?language=en&count=200&idCompetition=17&idSeason=285023

Tournament id:
`a98200a3-8648-4589-ad47-e8866db1d0e2`

## Numbering Rule

FanVerdict `game_number` uses chronological app order. FIFA's official match number is retained in `matches.source_ref` as `FIFA Match <number>`.

This matters in Round of 16 because FIFA Match 90 kicks off before FIFA Match 89:

- FanVerdict Game 89 = FIFA Match 90
- FanVerdict Game 90 = FIFA Match 89

## Completed / Ready To Load: Round Of 16 Confirmed

SQL prepared:
`supabase/create-fifa-2026-round-of-16-confirmed.sql`

Status:
`SQL prepared / pending Supabase run`

| FanVerdict Game | FIFA Match | Fixture | Kickoff UTC | Kickoff Eastern | Venue | Upload Status |
|---:|---:|---|---|---|---|---|
| 89 | 90 | Canada vs Morocco | 2026-07-04 17:00:00+00 | Sat Jul 4, 1:00 PM EDT | Houston Stadium, Houston | Ready to load |
| 90 | 89 | Paraguay vs France | 2026-07-04 21:00:00+00 | Sat Jul 4, 5:00 PM EDT | Philadelphia Stadium, Philadelphia | Ready to load |
| 91 | 91 | Brazil vs Norway | 2026-07-05 20:00:00+00 | Sun Jul 5, 4:00 PM EDT | New York/New Jersey Stadium, New Jersey | Ready to load |
| 92 | 92 | Mexico vs England | 2026-07-06 00:00:00+00 | Sun Jul 5, 8:00 PM EDT | Mexico City Stadium, Mexico City | Ready to load |
| 93 | 93 | Portugal vs Spain | 2026-07-06 19:00:00+00 | Mon Jul 6, 3:00 PM EDT | Dallas Stadium, Dallas | Ready to load |
| 94 | 94 | USA vs Belgium | 2026-07-07 00:00:00+00 | Mon Jul 6, 8:00 PM EDT | Seattle Stadium, Seattle | Ready to load |

## Due: Round Of 16 Not Yet Confirmed

These should not be loaded until FIFA populates both teams.

| FanVerdict Game | FIFA Match | FIFA Placeholder | Kickoff UTC | Kickoff Eastern | Venue | Due Reason |
|---:|---:|---|---|---|---|---|
| 95 | 95 | W86 vs W88 | 2026-07-07 16:00:00+00 | Tue Jul 7, 12:00 PM EDT | Atlanta Stadium, Atlanta | Both teams pending |
| 96 | 96 | W85 vs W87 | 2026-07-07 20:00:00+00 | Tue Jul 7, 4:00 PM EDT | BC Place Vancouver, Vancouver | One team pending |

## Due: Quarter-Finals Not Yet Confirmed

FIFA has the quarter-final schedule and venue slots, but not the actual teams yet. Do not create the QF upload SQL until both teams are available for each match.

| FanVerdict Game | FIFA Match | FIFA Placeholder | Kickoff UTC | Kickoff Eastern | Venue | Due Reason |
|---:|---:|---|---|---|---|---|
| 97 | 97 | W89 vs W90 | 2026-07-09 20:00:00+00 | Thu Jul 9, 4:00 PM EDT | Boston Stadium, Boston | Teams pending |
| 98 | 98 | W93 vs W94 | 2026-07-10 19:00:00+00 | Fri Jul 10, 3:00 PM EDT | Los Angeles Stadium, Los Angeles | Teams pending |
| 99 | 99 | W91 vs W92 | 2026-07-11 21:00:00+00 | Sat Jul 11, 5:00 PM EDT | Miami Stadium, Miami | Teams pending |
| 100 | 100 | W95 vs W96 | 2026-07-12 01:00:00+00 | Sat Jul 11, 9:00 PM EDT | Kansas City Stadium, Kansas City | Teams pending |

## Load Strategy

Use the same pattern as the Round of 32 scripts:

- Include only fixtures with both teams confirmed by FIFA.
- Upsert `public.matches` by `(tournament_id, game_number)`.
- Store the official FIFA match number in `matches.source_ref`.
- Create one poll per match if missing.
- Refresh poll question, lock time, and two team options while the poll is still `draft` or `open`.
- Knockout polls use only two options; no `Tie`.
- Do not overwrite `completed` or `cancelled` match status.
- Run the verification query at the bottom of the SQL and confirm each loaded fixture has exactly two poll options.

## Next Update

After the SQL is run successfully, change the six Round of 16 rows above from `Ready to load` to `Loaded`, and record the load date.

When FIFA confirms teams for Games 95-96, create:
`supabase/create-fifa-2026-round-of-16-remaining.sql`

When FIFA confirms teams for Games 97-100, create:
`supabase/create-fifa-2026-quarter-finals-confirmed.sql`
