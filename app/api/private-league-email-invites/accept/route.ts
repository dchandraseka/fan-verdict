import { createHash } from 'crypto';
import type { User } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { createServiceSupabaseClient } from '@/lib/supabase-server';
import type { PrivateLeague, PrivateLeagueMember, Profile, Tournament, TournamentMember } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

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

function profileNameFromUser(user: User) {
  return (
    user.user_metadata?.display_name ||
    user.user_metadata?.full_name ||
    user.email?.split('@')[0] ||
    'FanVerdict Player'
  );
}

async function ensureServerProfile(
  supabase: ReturnType<typeof createServiceSupabaseClient>,
  user: User,
) {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
  if (error) throw error;

  if (data) {
    const profile = data as Profile;
    if (!profile.email && user.email) {
      const { data: updatedProfile, error: updateError } = await supabase
        .from('profiles')
        .update({ email: user.email })
        .eq('id', user.id)
        .select('*')
        .single();

      if (updateError) throw updateError;
      return updatedProfile as Profile;
    }

    return profile;
  }

  const { data: createdProfile, error: createError } = await supabase
    .from('profiles')
    .insert({
      id: user.id,
      email: user.email,
      display_name: profileNameFromUser(user),
      whatsapp_number: user.user_metadata?.whatsapp_number ?? null,
      notification_channel: user.user_metadata?.notification_channel === 'none' ? 'none' : 'email',
    })
    .select('*')
    .single();

  if (createError) throw createError;
  return createdProfile as Profile;
}

async function ensureTournamentMembership(
  supabase: ReturnType<typeof createServiceSupabaseClient>,
  tournamentId: string,
  userId: string,
) {
  const { data, error } = await supabase
    .from('tournament_members')
    .select('*')
    .eq('tournament_id', tournamentId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;

  if (data) {
    const existingMember = data as TournamentMember;
    if (existingMember.status !== 'active') {
      const { error: updateError } = await supabase
        .from('tournament_members')
        .update({ status: 'active' })
        .eq('id', existingMember.id);

      if (updateError) throw updateError;
    }

    return;
  }

  const { error: insertError } = await supabase.from('tournament_members').insert({
    tournament_id: tournamentId,
    user_id: userId,
    role: 'participant',
    status: 'active',
  });

  if (insertError) throw insertError;
}

async function ensurePrivateLeagueMembership(
  supabase: ReturnType<typeof createServiceSupabaseClient>,
  invite: EmailInviteRow,
  userId: string,
) {
  const joinedAt = new Date().toISOString();
  const { data, error } = await supabase
    .from('private_league_members')
    .select('*')
    .eq('league_id', invite.league_id)
    .eq('profile_id', userId)
    .maybeSingle();

  if (error) throw error;

  if (data) {
    const existingMember = data as PrivateLeagueMember;
    const preservedRole = ['owner', 'admin'].includes(existingMember.role) ? existingMember.role : 'member';
    const { error: updateError } = await supabase
      .from('private_league_members')
      .update({
        role: preservedRole,
        status: 'active',
        invited_by: existingMember.invited_by ?? invite.invited_by,
        joined_at: existingMember.joined_at ?? joinedAt,
        removed_at: null,
      })
      .eq('id', existingMember.id);

    if (updateError) throw updateError;
    return;
  }

  const { error: insertError } = await supabase.from('private_league_members').insert({
    league_id: invite.league_id,
    profile_id: userId,
    role: 'member',
    status: 'active',
    invited_by: invite.invited_by,
    joined_at: joinedAt,
  });

  if (insertError) throw insertError;
}

export async function POST(request: Request) {
  const supabase = createServiceSupabaseClient();
  const user = await authenticatedUser(request, supabase);
  if (!user) return jsonError('Sign in before accepting this invite.', 401);

  let body: { token?: string };
  try {
    body = await request.json();
  } catch {
    return jsonError('Invalid request body.');
  }

  const rawToken = body.token?.trim();
  if (!rawToken) return jsonError('Invite token is required.');

  const userEmail = user.email?.trim().toLowerCase();
  if (!userEmail) return jsonError('Your account must have an email address to accept this invite.', 400);

  const tokenHash = hashToken(rawToken);
  const inviteResult = await supabase
    .from('private_league_email_invites')
    .select('*')
    .eq('token_hash', tokenHash)
    .maybeSingle();

  if (inviteResult.error) throw inviteResult.error;
  if (!inviteResult.data) return jsonError('Invite link is invalid.', 404);

  const invite = inviteResult.data as EmailInviteRow;

  if (invite.status === 'accepted') {
    if (invite.accepted_by === user.id) {
      const [leagueResult, tournamentResult] = await Promise.all([
        supabase.from('private_leagues').select('*').eq('id', invite.league_id).single(),
        supabase.from('tournaments').select('*').eq('id', invite.tournament_id).single(),
      ]);

      return NextResponse.json({
        ok: true,
        alreadyAccepted: true,
        league: leagueResult.data as PrivateLeague | null,
        tournament: tournamentResult.data as Tournament | null,
      });
    }

    return jsonError('This invite has already been accepted.', 409);
  }

  if (invite.status !== 'pending') {
    return jsonError('This invite is no longer active.', 410);
  }

  if (new Date(invite.expires_at).getTime() < Date.now()) {
    await supabase.from('private_league_email_invites').update({ status: 'expired' }).eq('id', invite.id);
    return jsonError('This invite has expired. Ask the private league admin to send a new invite.', 410);
  }

  if (invite.invited_email !== userEmail) {
    return jsonError(`This invite was sent to ${invite.invited_email}. Sign in with that email address to accept it.`, 403);
  }

  const [leagueResult, tournamentResult] = await Promise.all([
    supabase.from('private_leagues').select('*').eq('id', invite.league_id).eq('status', 'active').single(),
    supabase.from('tournaments').select('*').eq('id', invite.tournament_id).single(),
  ]);

  if (leagueResult.error || !leagueResult.data) return jsonError('Private league is no longer active.', 404);
  if (tournamentResult.error || !tournamentResult.data) return jsonError('Tournament not found.', 404);

  const league = leagueResult.data as PrivateLeague;
  const tournament = tournamentResult.data as Tournament;

  await ensureServerProfile(supabase, user);
  await ensureTournamentMembership(supabase, invite.tournament_id, user.id);
  await ensurePrivateLeagueMembership(supabase, invite, user.id);

  const acceptedAt = new Date().toISOString();
  const updateInviteResult = await supabase
    .from('private_league_email_invites')
    .update({
      status: 'accepted',
      accepted_by: user.id,
      accepted_at: acceptedAt,
    })
    .eq('id', invite.id)
    .eq('status', 'pending');

  if (updateInviteResult.error) throw updateInviteResult.error;

  await supabase.from('audit_log').insert({
    tournament_id: invite.tournament_id,
    actor_id: user.id,
    action: 'private_league_email_invite_accepted',
    details: {
      invite_id: invite.id,
      league_id: invite.league_id,
      invited_by: invite.invited_by,
    },
  });

  return NextResponse.json({
    ok: true,
    league,
    tournament,
  });
}
