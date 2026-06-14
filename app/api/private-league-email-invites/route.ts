import { createHash, randomBytes } from 'crypto';
import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { createServiceSupabaseClient } from '@/lib/supabase-server';
import type { PrivateLeague, Profile, Tournament } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const INVITE_DAYS = 14;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type EmailInviteRow = {
  id: string;
  league_id: string;
  tournament_id: string;
  invited_email: string;
  token_hash: string;
  status: 'pending' | 'accepted' | 'revoked' | 'expired';
  invited_by: string | null;
  accepted_by: string | null;
  accepted_at: string | null;
  expires_at: string;
  created_at: string;
  updated_at: string;
};

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

function emailConfigError() {
  if (!process.env.GMAIL_USER) return 'GMAIL_USER is required.';
  if (!process.env.GMAIL_APP_PASSWORD) return 'GMAIL_APP_PASSWORD is required.';
  return null;
}

function appBaseUrl(request: Request) {
  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
  if (configuredUrl) return configuredUrl.replace(/\/+$/, '');

  return new URL(request.url).origin;
}

function escapeHtml(value: string | number | null | undefined) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

async function authenticatedUser(request: Request, supabase: ReturnType<typeof createServiceSupabaseClient>) {
  const authorization = request.headers.get('authorization');
  const accessToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!accessToken) return null;

  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data.user) return null;

  return data.user;
}

async function canManagePrivateLeague(
  supabase: ReturnType<typeof createServiceSupabaseClient>,
  league: PrivateLeague,
  userId: string,
) {
  const [privateLeagueAdminResult, tournamentAdminResult] = await Promise.all([
    supabase
      .from('private_league_members')
      .select('id')
      .eq('league_id', league.id)
      .eq('profile_id', userId)
      .eq('status', 'active')
      .in('role', ['owner', 'admin'])
      .maybeSingle(),
    supabase
      .from('tournament_members')
      .select('id')
      .eq('tournament_id', league.tournament_id)
      .eq('user_id', userId)
      .eq('status', 'active')
      .in('role', ['owner', 'admin'])
      .maybeSingle(),
  ]);

  if (privateLeagueAdminResult.error) throw privateLeagueAdminResult.error;
  if (tournamentAdminResult.error) throw tournamentAdminResult.error;

  return Boolean(privateLeagueAdminResult.data || tournamentAdminResult.data);
}

function renderInviteEmail({
  inviteUrl,
  invitedBy,
  league,
  tournament,
}: {
  inviteUrl: string;
  invitedBy: Profile | null;
  league: PrivateLeague;
  tournament: Tournament;
}) {
  const inviterName = invitedBy?.display_name || invitedBy?.email || 'A FanVerdict participant';
  const text = [
    `${inviterName} invited you to join the FanVerdict private league "${league.name}" for ${tournament.name}.`,
    '',
    'Open this link, create or sign in to your FanVerdict account with this email address, and the app will add you to the tournament and private league:',
    inviteUrl,
    '',
    `This invite expires in ${INVITE_DAYS} days.`,
  ].join('\n');

  const html = `
    <div style="margin: 0; padding: 0; background: #f8fafc; font-family: Arial, sans-serif; color: #0f172a;">
      <div style="max-width: 640px; margin: 0 auto; padding: 24px 16px;">
        <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 24px;">
          <p style="margin: 0 0 8px; color: #2563eb; font-size: 12px; font-weight: 700; text-transform: uppercase;">FanVerdict Invite</p>
          <h1 style="margin: 0; font-size: 24px; line-height: 1.25;">Join ${escapeHtml(league.name)}</h1>
          <p style="margin: 12px 0 0; color: #475569;">
            ${escapeHtml(inviterName)} invited you to join this private league for
            <strong>${escapeHtml(tournament.name)}</strong>.
          </p>
          <div style="margin-top: 20px;">
            <a href="${escapeHtml(inviteUrl)}" style="display: inline-block; background: #2563eb; color: #ffffff; text-decoration: none; font-weight: 700; padding: 11px 16px; border-radius: 6px;">Accept invite</a>
          </div>
          <p style="margin: 20px 0 0; color: #64748b; font-size: 13px;">
            Create or sign in to your FanVerdict account with the invited email address. FanVerdict will add you to the tournament and private league automatically.
          </p>
          <p style="margin: 12px 0 0; color: #64748b; font-size: 12px;">This invite expires in ${INVITE_DAYS} days.</p>
        </div>
      </div>
    </div>
  `;

  return { html, text };
}

export async function POST(request: Request) {
  const missingEmailConfig = emailConfigError();
  if (missingEmailConfig) {
    return jsonError(missingEmailConfig, 500);
  }

  const supabase = createServiceSupabaseClient();
  const user = await authenticatedUser(request, supabase);
  if (!user) return jsonError('Sign in before sending private league invites.', 401);

  let body: { leagueId?: string; email?: string };
  try {
    body = await request.json();
  } catch {
    return jsonError('Invalid request body.');
  }

  const leagueId = body.leagueId?.trim();
  const invitedEmail = body.email?.trim().toLowerCase();

  if (!leagueId) return jsonError('Private league is required.');
  if (!invitedEmail || !EMAIL_PATTERN.test(invitedEmail) || invitedEmail.length > 320) {
    return jsonError('Enter a valid invite email address.');
  }

  const { data: leagueData, error: leagueError } = await supabase
    .from('private_leagues')
    .select('*')
    .eq('id', leagueId)
    .eq('status', 'active')
    .single();

  if (leagueError || !leagueData) return jsonError('Private league not found.', 404);

  const league = leagueData as PrivateLeague;
  const canManage = await canManagePrivateLeague(supabase, league, user.id);
  if (!canManage) return jsonError('Only private league admins can invite friends by email.', 403);

  const [tournamentResult, inviterResult] = await Promise.all([
    supabase.from('tournaments').select('*').eq('id', league.tournament_id).single(),
    supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
  ]);

  if (tournamentResult.error || !tournamentResult.data) return jsonError('Tournament not found.', 404);
  if (inviterResult.error) throw inviterResult.error;

  const tournament = tournamentResult.data as Tournament;
  const inviter = (inviterResult.data ?? null) as Profile | null;
  const rawToken = randomBytes(32).toString('base64url');
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const existingInviteResult = await supabase
    .from('private_league_email_invites')
    .select('*')
    .eq('league_id', league.id)
    .eq('invited_email', invitedEmail)
    .eq('status', 'pending')
    .maybeSingle();

  if (existingInviteResult.error) throw existingInviteResult.error;

  let savedInvite: EmailInviteRow | null = null;

  if (existingInviteResult.data) {
    const { data, error } = await supabase
      .from('private_league_email_invites')
      .update({
        token_hash: tokenHash,
        invited_by: user.id,
        accepted_by: null,
        accepted_at: null,
        expires_at: expiresAt,
      })
      .eq('id', (existingInviteResult.data as EmailInviteRow).id)
      .select('*')
      .single();

    if (error) throw error;
    savedInvite = data as EmailInviteRow;
  } else {
    const { data, error } = await supabase
      .from('private_league_email_invites')
      .insert({
        league_id: league.id,
        tournament_id: league.tournament_id,
        invited_email: invitedEmail,
        token_hash: tokenHash,
        status: 'pending',
        invited_by: user.id,
        expires_at: expiresAt,
      })
      .select('*')
      .single();

    if (error) throw error;
    savedInvite = data as EmailInviteRow;
  }

  if (!savedInvite) return jsonError('Unable to save invite.', 500);

  const inviteUrl = `${appBaseUrl(request)}/invite/${encodeURIComponent(rawToken)}`;
  const { html, text } = renderInviteEmail({ inviteUrl, invitedBy: inviter, league, tournament });

  try {
    await transporter.sendMail({
      from: `FanVerdict <${process.env.GMAIL_USER}>`,
      to: invitedEmail,
      subject: `${inviter?.display_name ?? 'FanVerdict'} invited you to ${league.name}`,
      html,
      text,
    });

    await supabase.from('audit_log').insert({
      tournament_id: league.tournament_id,
      actor_id: user.id,
      action: 'private_league_email_invite_sent',
      details: {
        invite_id: savedInvite.id,
        league_id: league.id,
        invited_email: invitedEmail,
      },
    });
  } catch (error) {
    console.error('Private league invite email failed:', error);
    return jsonError('Unable to send invite email. Check Gmail SMTP environment settings and try again.', 500);
  }

  return NextResponse.json({
    ok: true,
    inviteId: savedInvite.id,
    expiresAt: savedInvite.expires_at,
  });
}
