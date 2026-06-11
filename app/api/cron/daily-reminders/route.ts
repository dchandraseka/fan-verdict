import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { calculateStandings, optionLabel, sortedPollOptions } from '@/lib/fanverdict';
import { createServiceSupabaseClient } from '@/lib/supabase-server';
import type { Poll, PointsLedger, Profile, StandingRow, Tournament, TournamentMember, Vote } from '@/lib/types';

export const dynamic = 'force-dynamic';

const DEFAULT_REMINDER_LEAD_HOURS = 4;
const DEFAULT_REMINDER_TIME_ZONE = 'America/New_York';
const LEADERBOARD_ROW_LIMIT = 5;
const SETTLED_POLL_LIMIT = 3;

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

type LocalDateParts = {
  year: number;
  month: number;
  day: number;
};

type ReminderSummary = {
  reminderDate: string;
  timeZone: string;
  leadHours: number;
  tournamentsChecked: number;
  emailsSent: number;
  skippedAlreadySent: number;
  skippedNoMissingVotes: number;
  skippedOptedOut: number;
  skippedTooEarly: number;
  failed: number;
};

function positiveNumberFromEnv(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function cronAuthorizationError(request: Request) {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'CRON_SECRET must be configured in production.' }, { status: 500 });
  }

  if (cronSecret && request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  return null;
}

function emailConfigError() {
  if (!process.env.GMAIL_USER) return 'GMAIL_USER is required.';
  if (!process.env.GMAIL_APP_PASSWORD) return 'GMAIL_APP_PASSWORD is required.';
  return null;
}

function appBaseUrl(request: Request) {
  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
  if (configuredUrl) return configuredUrl.replace(/\/+$/, '');

  const requestUrl = new URL(request.url);
  return requestUrl.origin;
}

function escapeHtml(value: string | number | null | undefined) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function localDateParts(date: Date, timeZone: string): LocalDateParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const byType = new Map(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(byType.get('year')),
    month: Number(byType.get('month')),
    day: Number(byType.get('day')),
  };
}

function localDateKey(parts: LocalDateParts) {
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

function addLocalDays(parts: LocalDateParts, days: number): LocalDateParts {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function timeZoneOffsetMs(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  const byType = new Map(parts.map((part) => [part.type, part.value]));
  const zonedAsUtc = Date.UTC(
    Number(byType.get('year')),
    Number(byType.get('month')) - 1,
    Number(byType.get('day')),
    Number(byType.get('hour')),
    Number(byType.get('minute')),
    Number(byType.get('second')),
  );

  return zonedAsUtc - date.getTime();
}

function zonedTimeToUtc(parts: LocalDateParts, timeZone: string) {
  const guess = Date.UTC(parts.year, parts.month - 1, parts.day, 0, 0, 0);
  const firstPass = new Date(guess - timeZoneOffsetMs(new Date(guess), timeZone));
  return new Date(guess - timeZoneOffsetMs(firstPass, timeZone));
}

function localDayWindow(now: Date, timeZone: string) {
  const today = localDateParts(now, timeZone);
  const tomorrow = addLocalDays(today, 1);

  return {
    reminderDate: localDateKey(today),
    start: zonedTimeToUtc(today, timeZone),
    end: zonedTimeToUtc(tomorrow, timeZone),
  };
}

function formatReminderTime(value: string, timeZone: string) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(value));
}

function plural(count: number, singular: string, pluralLabel = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralLabel}`;
}

function activeEmailProfile(profile: Profile | undefined): profile is Profile & { email: string } {
  if (!profile?.email) return false;
  return profile.notification_channel !== 'none';
}

function voteKey(userId: string, pollId: string) {
  return `${userId}:${pollId}`;
}

function sortPollsByLockTime(polls: Poll[]) {
  return polls.slice().sort((a, b) => {
    const lockDiff = new Date(a.locks_at).getTime() - new Date(b.locks_at).getTime();
    return lockDiff || (a.matches?.game_number ?? 0) - (b.matches?.game_number ?? 0) || a.question.localeCompare(b.question);
  });
}

function renderPollList(polls: Poll[], timeZone: string) {
  return polls
    .map((poll) => {
      const options = sortedPollOptions(poll).map((option) => escapeHtml(option.label)).join(', ');
      return `
        <li style="margin: 0 0 12px;">
          <strong>${escapeHtml(poll.question)}</strong><br />
          <span style="color: #475569;">Locks ${escapeHtml(formatReminderTime(poll.locks_at, timeZone))}</span><br />
          <span style="color: #475569;">Options: ${options}</span>
        </li>
      `;
    })
    .join('');
}

function renderSettledPollList(polls: Poll[], timeZone: string) {
  if (polls.length === 0) {
    return '<p style="margin: 8px 0 0; color: #475569;">No settled polls yet.</p>';
  }

  return `
    <ul style="margin: 8px 0 0; padding-left: 20px;">
      ${polls
        .map(
          (poll) => `
            <li style="margin: 0 0 8px;">
              <strong>${escapeHtml(poll.question)}</strong><br />
              <span style="color: #475569;">Result: ${escapeHtml(optionLabel(poll, poll.result_option_id))}</span>
              ${
                poll.settled_at
                  ? `<br /><span style="color: #64748b;">Settled ${escapeHtml(formatReminderTime(poll.settled_at, timeZone))}</span>`
                  : ''
              }
            </li>
          `,
        )
        .join('')}
    </ul>
  `;
}

function renderLeaderboardRows(standings: StandingRow[], currentUserId: string) {
  const rows = standings.slice(0, LEADERBOARD_ROW_LIMIT);

  return rows
    .map((row, index) => {
      const isCurrentUser = row.user_id === currentUserId;
      return `
        <tr>
          <td style="padding: 8px; border-top: 1px solid #e2e8f0;">#${index + 1}</td>
          <td style="padding: 8px; border-top: 1px solid #e2e8f0; font-weight: ${isCurrentUser ? '700' : '500'};">
            ${escapeHtml(row.display_name)}${isCurrentUser ? ' (you)' : ''}
          </td>
          <td style="padding: 8px; border-top: 1px solid #e2e8f0; text-align: right;">${row.total_points}</td>
          <td style="padding: 8px; border-top: 1px solid #e2e8f0; text-align: right;">${row.accuracy}%</td>
        </tr>
      `;
    })
    .join('');
}

function renderReminderEmail({
  profile,
  tournament,
  missingPolls,
  latestSettledPolls,
  standings,
  dashboardUrl,
  timeZone,
}: {
  profile: Profile;
  tournament: Tournament;
  missingPolls: Poll[];
  latestSettledPolls: Poll[];
  standings: StandingRow[];
  dashboardUrl: string;
  timeZone: string;
}) {
  const currentRank = standings.findIndex((row) => row.user_id === profile.id) + 1;
  const currentStanding = standings.find((row) => row.user_id === profile.id);
  const firstLockTime = formatReminderTime(missingPolls[0].locks_at, timeZone);
  const missingCount = missingPolls.length;
  const greetingName = profile.display_name || profile.email || 'FanVerdict player';

  const text = [
    `Hi ${greetingName},`,
    '',
    `You have ${plural(missingCount, 'pick')} due today for ${tournament.name}. The first one locks ${firstLockTime}.`,
    '',
    'Open polls:',
    ...missingPolls.map(
      (poll) =>
        `- ${poll.question} | locks ${formatReminderTime(poll.locks_at, timeZone)} | options: ${sortedPollOptions(poll)
          .map((option) => option.label)
          .join(', ')}`,
    ),
    '',
    'Latest settled polls:',
    latestSettledPolls.length
      ? latestSettledPolls.map((poll) => `- ${poll.question}: ${optionLabel(poll, poll.result_option_id)}`).join('\n')
      : '- No settled polls yet.',
    '',
    currentStanding
      ? `Your standing: #${currentRank} with ${currentStanding.total_points} points and ${currentStanding.accuracy}% accuracy.`
      : 'Your standing will appear after the leaderboard has enough data.',
    '',
    `Dashboard: ${dashboardUrl}`,
    '',
    'You can opt out of reminders from Account Settings.',
  ].join('\n');

  const html = `
    <div style="margin: 0; padding: 0; background: #f8fafc; font-family: Arial, sans-serif; color: #0f172a;">
      <div style="max-width: 680px; margin: 0 auto; padding: 24px 16px;">
        <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 24px;">
          <p style="margin: 0 0 8px; color: #2563eb; font-size: 12px; font-weight: 700; text-transform: uppercase;">FanVerdict Reminder</p>
          <h1 style="margin: 0; font-size: 24px; line-height: 1.25;">${escapeHtml(plural(missingCount, 'pick'))} due today</h1>
          <p style="margin: 12px 0 0; color: #475569;">
            Hi ${escapeHtml(greetingName)}, your first pending pick for <strong>${escapeHtml(tournament.name)}</strong>
            locks ${escapeHtml(firstLockTime)}.
          </p>

          <div style="margin-top: 20px;">
            <a href="${escapeHtml(dashboardUrl)}" style="display: inline-block; background: #2563eb; color: #ffffff; text-decoration: none; font-weight: 700; padding: 11px 16px; border-radius: 6px;">Open FanVerdict</a>
          </div>

          <h2 style="margin: 28px 0 8px; font-size: 18px;">Open polls</h2>
          <ul style="margin: 8px 0 0; padding-left: 20px;">
            ${renderPollList(missingPolls, timeZone)}
          </ul>

          <h2 style="margin: 28px 0 8px; font-size: 18px;">Latest settled polls</h2>
          ${renderSettledPollList(latestSettledPolls, timeZone)}

          <h2 style="margin: 28px 0 8px; font-size: 18px;">Leaderboard snapshot</h2>
          ${
            currentStanding
              ? `<p style="margin: 8px 0 12px; color: #475569;">You are #${currentRank} with ${currentStanding.total_points} points and ${currentStanding.accuracy}% accuracy.</p>`
              : '<p style="margin: 8px 0 12px; color: #475569;">Your standing will appear after the leaderboard has enough data.</p>'
          }
          <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            <thead>
              <tr>
                <th style="padding: 8px; text-align: left; color: #64748b;">Rank</th>
                <th style="padding: 8px; text-align: left; color: #64748b;">Participant</th>
                <th style="padding: 8px; text-align: right; color: #64748b;">Points</th>
                <th style="padding: 8px; text-align: right; color: #64748b;">Accuracy</th>
              </tr>
            </thead>
            <tbody>${renderLeaderboardRows(standings, profile.id)}</tbody>
          </table>

          <p style="margin: 28px 0 0; color: #64748b; font-size: 12px;">You can opt out of reminders from Account Settings.</p>
        </div>
      </div>
    </div>
  `;

  return { html, text };
}

async function reserveReminderDelivery({
  supabase,
  tournamentId,
  profile,
  reminderDate,
  openPollCount,
}: {
  supabase: ReturnType<typeof createServiceSupabaseClient>;
  tournamentId: string;
  profile: Profile;
  reminderDate: string;
  openPollCount: number;
}) {
  const { error } = await supabase.from('reminder_deliveries').insert({
    tournament_id: tournamentId,
    profile_id: profile.id,
    reminder_date: reminderDate,
    channel: 'email',
    delivery_status: 'pending',
    email: profile.email,
    open_poll_count: openPollCount,
  });

  if (!error) return true;
  if (error.code === '23505') return false;
  throw error;
}

async function markReminderDelivery(
  supabase: ReturnType<typeof createServiceSupabaseClient>,
  tournamentId: string,
  profileId: string,
  reminderDate: string,
  status: 'sent' | 'failed',
  errorMessage?: string,
) {
  await supabase
    .from('reminder_deliveries')
    .update({
      delivery_status: status,
      sent_at: status === 'sent' ? new Date().toISOString() : null,
      error_message: errorMessage?.slice(0, 500) ?? null,
    })
    .eq('tournament_id', tournamentId)
    .eq('profile_id', profileId)
    .eq('reminder_date', reminderDate)
    .eq('channel', 'email');
}

async function loadTournamentReminderContext(supabase: ReturnType<typeof createServiceSupabaseClient>, tournamentId: string) {
  const [membersResult, pollsResult, ledgerResult] = await Promise.all([
    supabase.from('tournament_members').select('*').eq('tournament_id', tournamentId).eq('status', 'active').order('joined_at'),
    supabase
      .from('polls')
      .select('*, matches(*), poll_options(*)')
      .eq('tournament_id', tournamentId)
      .order('locks_at', { ascending: true }),
    supabase.from('points_ledger').select('*').eq('tournament_id', tournamentId),
  ]);

  if (membersResult.error) throw membersResult.error;
  if (pollsResult.error) throw pollsResult.error;
  if (ledgerResult.error) throw ledgerResult.error;

  const members = (membersResult.data ?? []) as TournamentMember[];
  const polls = (pollsResult.data ?? []) as Poll[];
  const ledger = (ledgerResult.data ?? []) as PointsLedger[];
  const profileIds = Array.from(new Set(members.map((member) => member.user_id)));
  const pollIds = polls.map((poll) => poll.id);

  const [profilesResult, votesResult] = await Promise.all([
    profileIds.length ? supabase.from('profiles').select('*').in('id', profileIds) : { data: [], error: null },
    pollIds.length ? supabase.from('votes').select('*').in('poll_id', pollIds) : { data: [], error: null },
  ]);

  if (profilesResult.error) throw profilesResult.error;
  if (votesResult.error) throw votesResult.error;

  const profiles = (profilesResult.data ?? []) as Profile[];
  const votes = (votesResult.data ?? []) as Vote[];
  const latestSettledPolls = polls
    .filter((poll) => poll.status === 'settled')
    .sort(
      (a, b) =>
        new Date(b.settled_at ?? b.updated_at).getTime() -
        new Date(a.settled_at ?? a.updated_at).getTime(),
    )
    .slice(0, SETTLED_POLL_LIMIT);

  return {
    members,
    profiles,
    polls,
    votes,
    ledger,
    latestSettledPolls,
    standings: calculateStandings(members, profiles, votes, polls, ledger),
  };
}

export async function GET(request: Request) {
  const authError = cronAuthorizationError(request);
  if (authError) return authError;

  const missingEmailConfig = emailConfigError();
  if (missingEmailConfig) {
    return NextResponse.json({ error: missingEmailConfig }, { status: 500 });
  }

  const supabase = createServiceSupabaseClient();
  const now = new Date();
  const timeZone = process.env.REMINDER_TIME_ZONE || DEFAULT_REMINDER_TIME_ZONE;
  const leadHours = positiveNumberFromEnv(process.env.REMINDER_LEAD_HOURS, DEFAULT_REMINDER_LEAD_HOURS);
  const leadMs = leadHours * 60 * 60 * 1000;
  const { reminderDate, start, end } = localDayWindow(now, timeZone);
  const dashboardUrl = appBaseUrl(request);
  const summary: ReminderSummary = {
    reminderDate,
    timeZone,
    leadHours,
    tournamentsChecked: 0,
    emailsSent: 0,
    skippedAlreadySent: 0,
    skippedNoMissingVotes: 0,
    skippedOptedOut: 0,
    skippedTooEarly: 0,
    failed: 0,
  };

  const { data: openPollData, error: openPollError } = await supabase
    .from('polls')
    .select('*, matches(*), poll_options(*)')
    .eq('status', 'open')
    .gt('locks_at', now.toISOString())
    .gte('locks_at', start.toISOString())
    .lt('locks_at', end.toISOString())
    .order('locks_at', { ascending: true });

  if (openPollError) {
    return NextResponse.json({ error: openPollError.message }, { status: 500 });
  }

  const todaysOpenPolls = sortPollsByLockTime((openPollData ?? []) as Poll[]);
  const tournamentIds = Array.from(new Set(todaysOpenPolls.map((poll) => poll.tournament_id)));

  if (tournamentIds.length === 0) {
    return NextResponse.json({ ok: true, summary });
  }

  const { data: tournamentData, error: tournamentError } = await supabase
    .from('tournaments')
    .select('*')
    .in('id', tournamentIds)
    .eq('status', 'active');

  if (tournamentError) {
    return NextResponse.json({ error: tournamentError.message }, { status: 500 });
  }

  const activeTournaments = (tournamentData ?? []) as Tournament[];

  for (const tournament of activeTournaments) {
    summary.tournamentsChecked += 1;
    const tournamentOpenPolls = todaysOpenPolls.filter((poll) => poll.tournament_id === tournament.id);
    const firstPoll = tournamentOpenPolls[0];
    if (!firstPoll) continue;

    const firstReminderTime = new Date(new Date(firstPoll.locks_at).getTime() - leadMs);
    if (now.getTime() < firstReminderTime.getTime()) {
      summary.skippedTooEarly += 1;
      continue;
    }

    try {
      const context = await loadTournamentReminderContext(supabase, tournament.id);
      const profileById = new Map(context.profiles.map((profile) => [profile.id, profile]));
      const votedPollIdsByUser = new Set(context.votes.map((vote) => voteKey(vote.user_id, vote.poll_id)));

      for (const member of context.members) {
        const profile = profileById.get(member.user_id);

        if (!activeEmailProfile(profile)) {
          summary.skippedOptedOut += 1;
          continue;
        }

        const missingPolls = tournamentOpenPolls.filter((poll) => !votedPollIdsByUser.has(voteKey(member.user_id, poll.id)));
        if (missingPolls.length === 0) {
          summary.skippedNoMissingVotes += 1;
          continue;
        }

        const deliveryReserved = await reserveReminderDelivery({
          supabase,
          tournamentId: tournament.id,
          profile,
          reminderDate,
          openPollCount: missingPolls.length,
        });

        if (!deliveryReserved) {
          summary.skippedAlreadySent += 1;
          continue;
        }

        const { html, text } = renderReminderEmail({
          profile,
          tournament,
          missingPolls,
          latestSettledPolls: context.latestSettledPolls,
          standings: context.standings,
          dashboardUrl,
          timeZone,
        });

        const subject = `FanVerdict reminder: ${plural(missingPolls.length, 'pick')} due for ${tournament.name}`;
        const mailOptions = {
          from: `FanVerdict <${process.env.GMAIL_USER}>`,
          to: profile.email,
          subject,
          html,
          text,
        };

        try {
          await transporter.sendMail(mailOptions);
          await markReminderDelivery(supabase, tournament.id, profile.id, reminderDate, 'sent');
          summary.emailsSent += 1;
        } catch (error) {
          console.error('SMTP email delivery failed:', error);
          const errorMessage = error instanceof Error ? error.message : 'Unable to send reminder email.';
          await markReminderDelivery(supabase, tournament.id, profile.id, reminderDate, 'failed', errorMessage);
          summary.failed += 1;
        }
      }
    } catch (error) {
      summary.failed += 1;
      await supabase.from('audit_log').insert({
        tournament_id: tournament.id,
        actor_id: null,
        action: 'daily_reminder_failed',
        details: {
          error: error instanceof Error ? error.message : 'Daily reminder failed.',
        },
      });
    }
  }

  return NextResponse.json({ ok: summary.failed === 0, summary });
}
