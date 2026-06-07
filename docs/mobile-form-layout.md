# FanVerdict Mobile Form Layout

This document defines a mobile-first layout for the current FanVerdict form flows. It is intended as the starting point for a native mobile app or a mobile-specific web pass.

## Mobile Shell

- Target width: 360px to 430px.
- App header: 56px height, page title, optional back button, optional overflow menu.
- Bottom navigation: Home, Claim, Admin, Account.
- Show Admin only for app admins or tournament admins.
- Use full-screen routes for complex forms.
- Use bottom sheets for short pickers such as tournament, poll, winner, participant, and reminder preference.
- Use sticky bottom action bars for submit buttons on every multi-field form.
- Form inputs should be at least 48px tall with 16px text to avoid mobile zoom.
- Keep one primary action per screen. Secondary actions should be text buttons or overflow actions.

## Shared Form Pattern

```text
+-------------------------+
| Back   Screen title  ...|
+-------------------------+
| Section label           |
| Main heading            |
| Helper text             |
|                         |
| Field label             |
| [ input / picker      ] |
| Validation text         |
|                         |
| Field label             |
| [ input / picker      ] |
|                         |
| Message / status banner |
+-------------------------+
| [ Primary action      ] |
+-------------------------+
```

## Authentication

Current source: `app/login/page.tsx`

### Sign In

- Header: FanVerdict logo and `Sign in`.
- Segmented control: `Sign in` / `Create`.
- Fields: Email, Password.
- Primary action: `Sign in`.
- Secondary link: `Create account` if segmented control is not used.

```text
+-------------------------+
| FanVerdict              |
+-------------------------+
| Sign in                 |
| [ Sign in | Create ]    |
|                         |
| Email                   |
| [ you@example.com     ] |
| Password                |
| [ ********           ] |
|                         |
| [ Sign in            ] |
+-------------------------+
```

### Create Account

- Same screen, toggled state.
- Fields: Display name, Email, Password, Phone / WhatsApp number, Reminder preference.
- Phone is optional, but if entered it should validate below the field.
- Reminder preference should open a picker sheet.
- Primary action: `Create account`.

## Home Voting Form

Current source: `app/page.tsx`

### Tournament Picker

- Place current tournament in a compact header chip.
- Tapping opens a bottom sheet grouped by `Current` and `Historical`.
- Default selection should be the most recent tournament.

```text
+-------------------------+
| FanVerdict      Account |
+-------------------------+
| IPL 2026      Change v  |
| Rank, points, open polls|
+-------------------------+
```

### Poll Card

- One card per open poll.
- Question is the card title.
- Lock time is a small status row.
- Options are large stacked buttons.
- Selected option should use a filled state.
- After vote save, show a compact success banner at the top of the list.

```text
+-------------------------+
| Game 12                 |
| CSK vs RCB: who wins?   |
| Locks Today 7:30 PM     |
|                         |
| [ CSK                ]  |
| [ RCB      Selected ]  |
|                         |
| Vote saved              |
+-------------------------+
```

## Claim Profile

Current source: `app/claim/page.tsx`

### Claim List

- Replace the wide table with searchable cards.
- Search field at top: `Search historical name`.
- Filter chips: `All`, `Unclaimed`, `Pending`, `Claimed`.
- Each card shows participant name, status badge, seasons, total points, correct picks, and missed events.
- Status badge values: Your profile, Claimed, Pending, Blocked, Unclaimed.
- Primary card action: `Request claim`, disabled for unavailable states.

```text
+-------------------------+
| Back   Claim Profile    |
+-------------------------+
| [ Search name        ]  |
| All Unclaimed Pending   |
|                         |
| Dinesh        Claimed   |
| 2 seasons   75 pts      |
| 70 correct  8 missed    |
|                         |
| Sai          Unclaimed  |
| 2 seasons   68 pts      |
| [ Request claim      ]  |
+-------------------------+
```

### Claim Confirmation

- Tapping `Request claim` opens a confirmation sheet.
- The sheet repeats the participant name and stats.
- Primary action: `Submit request`.
- Secondary action: `Cancel`.

## Account Settings

Current source: `app/account/page.tsx`

### Profile And Alerts

- Use two tabs: `Profile` and `Password`.
- Profile tab fields: Display name, Phone / WhatsApp number, Receive alerts by.
- `Receive alerts by` should open a picker sheet.
- Sticky action: `Save`.

```text
+-------------------------+
| Back   Account          |
+-------------------------+
| [ Profile | Password ]  |
|                         |
| Display name            |
| [ Dinesh             ]  |
| Phone / WhatsApp        |
| [ +1 ...            ]  |
| Receive alerts by       |
| [ Email only        v]  |
+-------------------------+
| [ Save               ]  |
+-------------------------+
```

### Password

- Fields: New password, Confirm new password.
- Sticky action: `Update password`.
- Disable action until both fields are valid.

## Admin Claim Review

Current source: `app/admin/page.tsx`

- Make historical claim review the first admin screen because it is a short operational task.
- Use a tab bar inside Admin: Claims, Polls, Results, Members.
- Claim request card fields:
  - Historical profile name
  - Requester display name and email
  - Request date
  - Approve and Reject actions
- Require a confirmation sheet before approval.

```text
+-------------------------+
| Back   Admin            |
+-------------------------+
| Claims Polls Results ...|
|                         |
| Sai                     |
| Requested by Sai C.     |
| Jun 4, 2026             |
| [ Reject ] [ Approve ]  |
+-------------------------+
```

## Admin Create Tournament

Current source: `app/admin/page.tsx`

- Full-screen form under Admin.
- Fields: Tournament name, Season year.
- Sticky action: `Create tournament`.
- After create, navigate to that tournament's admin screen.

## Admin Create Match Poll

Current source: `app/admin/page.tsx`

- Break into two sections on one screen.
- Match section fields: Game number, Team A, Team B, Additional options, Venue.
- Poll section fields: Poll question, Match start / poll lock time.
- Use native date/time picker controls.
- Sticky action: `Create match poll`.

```text
+-------------------------+
| Back   Match Poll       |
+-------------------------+
| Match                   |
| Game number             |
| [ 12                 ]  |
| Team A                  |
| [ CSK                ]  |
| Team B                  |
| [ RCB                ]  |
| [+ Add option]          |
| Venue                   |
| [ Chennai            ]  |
|                         |
| Poll                    |
| Question                |
| [ Who will win?      ]  |
| Lock time               |
| [ Today 7:30 PM     v]  |
+-------------------------+
| [ Create match poll  ]  |
+-------------------------+
```

## Admin Create Manual Poll

Current source: `app/admin/page.tsx`

- Fields: Poll question, Options, Poll lock time.
- Options should be stacked inputs with an `Add option` button.
- Sticky action: `Create manual poll`.

## Admin Edit Poll

Current source: `app/admin/page.tsx`

- First screen: list of editable open polls.
- Tapping one opens the edit form.
- Fields: Poll question, Lock time, Venue, Option inputs.
- Venue is shown only for match polls.
- Sticky action: `Save corrections`.

## Admin Set Result

Current source: `app/admin/page.tsx`

- First field: poll picker sheet.
- Show selected poll summary before result fields.
- Fields: Winning option picker, Points per correct vote.
- Sticky action: `Set result`.
- Confirmation sheet should show total votes and expected points if available.

## Admin Members And Adjustments

Current source: `app/admin/page.tsx`

### Promote Co-Admin

- Participant picker sheet.
- Primary action: `Promote`.

### Manual Point Adjustment

- Fields: Participant picker, Point adjustment, Note.
- Point adjustment should use a stepper input.
- Sticky action: `Save adjustment`.
- Use warning copy inside the confirmation sheet because this changes standings.

## Implementation Notes

- On mobile, tables should become cards. Avoid horizontal scrolling for primary workflows.
- Use picker sheets instead of long native select controls when option labels are long.
- Keep admin workflows separated by task; do not place all admin forms on one mobile screen.
- Keep destructive or irreversible admin actions behind confirmation sheets.
- Preserve the current Supabase calls and validation logic where possible; the main change is presentation and navigation.
