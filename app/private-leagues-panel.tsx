"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  BarChart3,
  Check,
  Download,
  Eye,
  EyeOff,
  Mail,
  Plus,
  Send,
  Share2,
  Shield,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { getErrorMessage } from '@/lib/errors';
import { calculatePrivateLeagueStandings, formatDateTime } from '@/lib/fanverdict';
import { createStandingsShareImage, downloadBlob, slugifyFileName } from '@/lib/standings-share-image';
import { supabase } from '@/lib/supabase';
import type {
  PrivateLeague,
  PrivateLeagueJoinRequest,
  PrivateLeagueMember,
  PrivateLeagueVisibility,
  Profile,
  StandingRow,
  Tournament,
  TournamentMember,
} from '@/lib/types';

type PrivateLeagueTab = 'myLeagues' | 'allLeagues';

type PrivateLeaguesPanelProps = {
  session: Session;
  tournament: Tournament;
  activeMembers: TournamentMember[];
  profiles: Profile[];
  standings: StandingRow[];
  canTournamentAdmin: boolean;
  onTournamentRefresh: () => Promise<void>;
};

const MAX_CREATED_LEAGUES = 2;
const MAX_JOIN_REQUEST_ATTEMPTS = 3;

function csvValue(value: string | number) {
  const stringValue = String(value);
  if (!/[",\n]/.test(stringValue)) return stringValue;
  return `"${stringValue.replace(/"/g, '""')}"`;
}

function filenameSafe(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'private-league';
}

function getSelectedLeagueShareUrl(league: Pick<PrivateLeague, 'id' | 'tournament_id'>) {
  if (typeof window === 'undefined') return '';

  return `${window.location.origin}${window.location.pathname}?tournament=${league.tournament_id}&privateLeague=${league.id}#private-leagues`;
}

export default function PrivateLeaguesPanel({
  session,
  tournament,
  activeMembers,
  profiles,
  standings,
  canTournamentAdmin,
  onTournamentRefresh,
}: PrivateLeaguesPanelProps) {
  const [leagues, setLeagues] = useState<PrivateLeague[]>([]);
  const [leagueMembers, setLeagueMembers] = useState<PrivateLeagueMember[]>([]);
  const [joinRequests, setJoinRequests] = useState<PrivateLeagueJoinRequest[]>([]);
  const [selectedLeagueId, setSelectedLeagueId] = useState('');
  const [tab, setTab] = useState<PrivateLeagueTab>('myLeagues');
  const [leagueName, setLeagueName] = useState('');
  const [leagueDescription, setLeagueDescription] = useState('');
  const [leagueVisibility, setLeagueVisibility] = useState<PrivateLeagueVisibility>('discoverable');
  const [inviteProfileId, setInviteProfileId] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [message, setMessage] = useState('');
  const [busyKey, setBusyKey] = useState('');
  const [isSharingStandingsImage, setIsSharingStandingsImage] = useState(false);

  const profileById = useMemo(() => new Map(profiles.map((profile) => [profile.id, profile])), [profiles]);
  const activeTournamentMemberIds = useMemo(() => new Set(activeMembers.map((member) => member.user_id)), [activeMembers]);
  const isTournamentParticipant = activeTournamentMemberIds.has(session.user.id);

  const createdByMeCount = useMemo(
    () => leagues.filter((league) => league.created_by === session.user.id && league.status === 'active').length,
    [leagues, session.user.id],
  );

  const myLeagueMemberships = useMemo(
    () => leagueMembers.filter((member) => member.profile_id === session.user.id && ['active', 'invited'].includes(member.status)),
    [leagueMembers, session.user.id],
  );

  const myLeagueIds = useMemo(() => new Set(myLeagueMemberships.map((member) => member.league_id)), [myLeagueMemberships]);
  const myLeagues = useMemo(() => leagues.filter((league) => myLeagueIds.has(league.id)), [leagues, myLeagueIds]);
  const visibleLeagues = tab === 'myLeagues' ? myLeagues : leagues;

  const selectedLeague = useMemo(
    () => visibleLeagues.find((league) => league.id === selectedLeagueId) ?? visibleLeagues[0] ?? null,
    [selectedLeagueId, visibleLeagues],
  );

  const selectedMembers = useMemo(
    () => (selectedLeague ? leagueMembers.filter((member) => member.league_id === selectedLeague.id) : []),
    [leagueMembers, selectedLeague],
  );

  const selectedStandings = useMemo(
    () => (selectedLeague ? calculatePrivateLeagueStandings(standings, leagueMembers, selectedLeague.id) : []),
    [leagueMembers, selectedLeague, standings],
  );

  const selectedActiveMembers = useMemo(
    () => selectedMembers.filter((member) => member.status === 'active'),
    [selectedMembers],
  );

  const selectedMyMembership = useMemo(
    () => selectedMembers.find((member) => member.profile_id === session.user.id) ?? null,
    [selectedMembers, session.user.id],
  );

  const canManageSelectedLeague =
    Boolean(selectedMyMembership?.status === 'active' && ['owner', 'admin'].includes(selectedMyMembership.role)) || canTournamentAdmin;

  const selectedPendingRequests = useMemo(
    () => (selectedLeague ? joinRequests.filter((request) => request.league_id === selectedLeague.id && request.status === 'pending') : []),
    [joinRequests, selectedLeague],
  );

  const selectedMyRequests = useMemo(
    () =>
      selectedLeague
        ? joinRequests
            .filter((request) => request.league_id === selectedLeague.id && request.requester_profile_id === session.user.id)
            .slice()
            .sort((a, b) => b.attempt_number - a.attempt_number || new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        : [],
    [joinRequests, selectedLeague, session.user.id],
  );

  const selectedMyPendingRequest = selectedMyRequests.find((request) => request.status === 'pending') ?? null;
  const selectedMyRequestAttempts = selectedMyRequests[0]?.attempt_number ?? 0;
  const selectedIsActiveOrInvitedMember = Boolean(
    selectedMyMembership && ['active', 'invited'].includes(selectedMyMembership.status),
  );
  const inviteEmailValue = inviteEmail.trim().toLowerCase();
  const inviteEmailLooksValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteEmailValue);

  const canRequestSelectedLeague =
    Boolean(selectedLeague?.visibility === 'discoverable') &&
    isTournamentParticipant &&
    !selectedIsActiveOrInvitedMember &&
    !selectedMyPendingRequest &&
    selectedMyRequestAttempts < MAX_JOIN_REQUEST_ATTEMPTS;

  const invitableProfiles = useMemo(() => {
    if (!selectedLeague) return [];
    const currentMemberIds = new Set(
      selectedMembers
        .filter((member) => ['active', 'invited'].includes(member.status))
        .map((member) => member.profile_id),
    );

    return activeMembers
      .filter((member) => !currentMemberIds.has(member.user_id))
      .map((member) => profileById.get(member.user_id))
      .filter((profile): profile is Profile => Boolean(profile))
      .sort((a, b) => a.display_name.localeCompare(b.display_name));
  }, [activeMembers, profileById, selectedLeague, selectedMembers]);

  const loadPrivateLeagues = useCallback(async () => {
    if (!tournament.id) return;

    try {
      const leaguesResult = await supabase
        .from('private_leagues')
        .select('*')
        .eq('tournament_id', tournament.id)
        .eq('status', 'active')
        .order('created_at', { ascending: true });

      if (leaguesResult.error) throw leaguesResult.error;

      const loadedLeagues = (leaguesResult.data ?? []) as PrivateLeague[];
      const leagueIds = loadedLeagues.map((league) => league.id);

      let loadedMembers: PrivateLeagueMember[] = [];
      let loadedRequests: PrivateLeagueJoinRequest[] = [];

      if (leagueIds.length > 0) {
        const [membersResult, requestsResult] = await Promise.all([
          supabase.from('private_league_members').select('*').in('league_id', leagueIds),
          supabase
            .from('private_league_join_requests')
            .select('*')
            .in('league_id', leagueIds)
            .order('created_at', { ascending: false }),
        ]);

        if (membersResult.error) throw membersResult.error;
        if (requestsResult.error) throw requestsResult.error;

        loadedMembers = (membersResult.data ?? []) as PrivateLeagueMember[];
        loadedRequests = (requestsResult.data ?? []) as PrivateLeagueJoinRequest[];
      }

      setLeagues(loadedLeagues);
      setLeagueMembers(loadedMembers);
      setJoinRequests(loadedRequests);
      const sharedLeagueId =
        typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('privateLeague') : null;

      if (sharedLeagueId && loadedLeagues.some((league) => league.id === sharedLeagueId)) {
        setTab('allLeagues');
      }

      setSelectedLeagueId((current) => {
        if (sharedLeagueId && loadedLeagues.some((league) => league.id === sharedLeagueId)) return sharedLeagueId;
        if (current && loadedLeagues.some((league) => league.id === current)) return current;
        return loadedLeagues[0]?.id ?? '';
      });
    } catch (error) {
      setMessage(getErrorMessage(error, 'Unable to load private leagues.'));
    }
  }, [tournament.id]);

  useEffect(() => {
    setMessage('');
    setSelectedLeagueId('');
    setInviteProfileId('');
    setInviteEmail('');
    loadPrivateLeagues();
  }, [loadPrivateLeagues]);

  useEffect(() => {
    if (!visibleLeagues.some((league) => league.id === selectedLeagueId)) {
      setSelectedLeagueId(visibleLeagues[0]?.id ?? '');
    }
  }, [selectedLeagueId, visibleLeagues]);

  const runAction = async (key: string, action: () => Promise<void>) => {
    setBusyKey(key);
    setMessage('');

    try {
      await action();
    } catch (error) {
      setMessage(getErrorMessage(error, 'Private league action failed.'));
    } finally {
      setBusyKey('');
    }
  };

  const handleCreateLeague = async () => {
    const trimmedName = leagueName.trim();
    if (trimmedName.length < 3) {
      setMessage('Private league name must be at least 3 characters.');
      return;
    }

    if (createdByMeCount >= MAX_CREATED_LEAGUES) {
      setMessage('You can create a maximum of 2 private leagues per tournament.');
      return;
    }

    await runAction('create-league', async () => {
      const { data, error } = await supabase.rpc('create_private_league', {
        target_tournament_id: tournament.id,
        league_name: trimmedName,
        league_description: leagueDescription.trim() || null,
        league_visibility: leagueVisibility,
      });

      if (error) throw error;

      const createdLeague = data as PrivateLeague | null;
      setLeagueName('');
      setLeagueDescription('');
      setLeagueVisibility('discoverable');
      setTab('myLeagues');
      if (createdLeague?.id) setSelectedLeagueId(createdLeague.id);
      await loadPrivateLeagues();
      setMessage(`Private league ${trimmedName} created.`);
    });
  };

  const handleInviteMember = async () => {
    if (!selectedLeague || !inviteProfileId) return;

    await runAction(`invite-${selectedLeague.id}`, async () => {
      const { error } = await supabase.rpc('invite_private_league_member', {
        target_league_id: selectedLeague.id,
        target_profile_id: inviteProfileId,
      });

      if (error) throw error;

      const invitedName = profileById.get(inviteProfileId)?.display_name ?? 'participant';
      setInviteProfileId('');
      await loadPrivateLeagues();
      setMessage(`Invite sent to ${invitedName}.`);
    });
  };

  const handleInviteFriendByEmail = async () => {
    if (!selectedLeague) return;

    if (!inviteEmailLooksValid) {
      setMessage('Enter a valid friend email address.');
      return;
    }

    await runAction(`invite-email-${selectedLeague.id}`, async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) throw new Error('Sign in before inviting friends by email.');

      const response = await fetch('/api/private-league-email-invites', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${data.session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          leagueId: selectedLeague.id,
          email: inviteEmailValue,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error || 'Unable to send private league invite email.');
      }

      setInviteEmail('');
      setMessage(`Invite email sent to ${inviteEmailValue}.`);
    });
  };

  const handleAcceptInvite = async (league: PrivateLeague) => {
    await runAction(`accept-${league.id}`, async () => {
      const { error } = await supabase.rpc('accept_private_league_invite', {
        target_league_id: league.id,
      });
      if (error) throw error;

      await Promise.all([loadPrivateLeagues(), onTournamentRefresh()]);
      setMessage(`Joined ${league.name}.`);
    });
  };

  const handleDeclineInvite = async (league: PrivateLeague) => {
    await runAction(`decline-${league.id}`, async () => {
      const { error } = await supabase.rpc('decline_private_league_invite', {
        target_league_id: league.id,
      });
      if (error) throw error;

      await loadPrivateLeagues();
      setMessage(`Declined ${league.name}.`);
    });
  };

  const handleRequestJoin = async (league: PrivateLeague) => {
    await runAction(`request-${league.id}`, async () => {
      const { error } = await supabase.rpc('request_private_league_join', {
        target_league_id: league.id,
        request_note: null,
      });
      if (error) throw error;

      await loadPrivateLeagues();
      setMessage(`Request sent to ${league.name}.`);
    });
  };

  const handleReviewRequest = async (request: PrivateLeagueJoinRequest, decision: 'approved' | 'rejected') => {
    await runAction(`review-${request.id}-${decision}`, async () => {
      const { error } = await supabase.rpc('review_private_league_join_request', {
        target_request_id: request.id,
        decision,
        review_note: null,
      });
      if (error) throw error;

      await Promise.all([loadPrivateLeagues(), decision === 'approved' ? onTournamentRefresh() : Promise.resolve()]);
      setMessage(`Join request ${decision}.`);
    });
  };

  const handleRemoveMember = async (member: PrivateLeagueMember) => {
    if (!selectedLeague) return;

    await runAction(`remove-${member.id}`, async () => {
      const { error } = await supabase.rpc('remove_private_league_member', {
        target_league_id: selectedLeague.id,
        target_profile_id: member.profile_id,
      });
      if (error) throw error;

      await loadPrivateLeagues();
      setMessage(`${profileById.get(member.profile_id)?.display_name ?? 'Member'} removed from ${selectedLeague.name}.`);
    });
  };

  const shareSelectedLeague = async () => {
    if (!selectedLeague) return;

    const lines = selectedStandings.map(
      (row, index) => `${index + 1}. ${row.display_name}: ${row.total_points} pts, ${row.accuracy}% accuracy`,
    );
    const shareUrl = getSelectedLeagueShareUrl(selectedLeague);
    const shareText = [
      `FanVerdict private league standings: ${selectedLeague.name}`,
      shareUrl,
      '',
      ...lines,
    ].join('\n');

    if (navigator.share) {
      await navigator.share({ title: selectedLeague.name, text: shareText, url: shareUrl });
      return;
    }

    await navigator.clipboard?.writeText(shareText);
    setMessage('Private league standings copied.');
  };

  const shareSelectedLeagueImage = async () => {
    if (!selectedLeague) return;

    if (selectedStandings.length === 0) {
      setMessage('No private league standings are available to share yet.');
      return;
    }

    setIsSharingStandingsImage(true);
    setMessage('');

    try {
      const shareUrl = getSelectedLeagueShareUrl(selectedLeague);
      const shareText = `FanVerdict private league standings: ${selectedLeague.name}\n${shareUrl}`;
      const imageBlob = await createStandingsShareImage({
        standings: selectedStandings,
        title: selectedLeague.name,
        subtitle: `${tournament.name} Private League Standings`,
      });
      const fileName = `${slugifyFileName(selectedLeague.name)}-standings.png`;
      const imageFile = new File([imageBlob], fileName, { type: 'image/png' });
      const canShareImage =
        typeof navigator.share === 'function' &&
        typeof navigator.canShare === 'function' &&
        navigator.canShare({ files: [imageFile] });

      if (canShareImage) {
        await navigator.share({
          title: `${selectedLeague.name} standings`,
          text: shareText,
          url: shareUrl,
          files: [imageFile],
        } as ShareData & { files: File[] });
        setMessage('Private league standings image shared.');
        return;
      }

      downloadBlob(imageBlob, fileName);

      try {
        await navigator.clipboard?.writeText(shareText);
        setMessage('Private league standings image downloaded and link copied.');
      } catch {
        setMessage('Private league standings image downloaded.');
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setMessage(getErrorMessage(error, 'Unable to share private league standings image.'));
    } finally {
      setIsSharingStandingsImage(false);
    }
  };

  const exportSelectedLeague = () => {
    if (!selectedLeague) return;

    const csvRows = [
      ['Rank', 'Participant', 'Points', 'Correct', 'Settled Votes', 'Accuracy'],
      ...selectedStandings.map((row, index) => [
        index + 1,
        row.display_name,
        row.total_points,
        row.correct_picks,
        row.settled_votes,
        `${row.accuracy}%`,
      ]),
    ];
    const csv = csvRows.map((row) => row.map(csvValue).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${filenameSafe(selectedLeague.name)}-standings.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section id="private-leagues" className="scroll-mt-6 rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <div>
          <h2 className="flex items-center gap-2 font-bold">
            <Users size={18} />
            Private Leagues
          </h2>
          <p className="mt-1 text-sm text-slate-500">Create smaller groups inside {tournament.name} without changing tournament votes.</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setTab('myLeagues')}
            className={`inline-flex h-9 items-center rounded-md px-3 text-sm font-bold ${
              tab === 'myLeagues' ? 'bg-blue-600 text-white' : 'border border-slate-300 text-slate-700 hover:bg-slate-50'
            }`}
          >
            My leagues
          </button>
          <button
            onClick={() => setTab('allLeagues')}
            className={`inline-flex h-9 items-center rounded-md px-3 text-sm font-bold ${
              tab === 'allLeagues' ? 'bg-blue-600 text-white' : 'border border-slate-300 text-slate-700 hover:bg-slate-50'
            }`}
          >
            All private leagues
          </button>
        </div>
      </div>

      <div className="grid gap-5 p-5 lg:grid-cols-[0.95fr_1.45fr]">
        <div className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 font-bold">
                <Plus size={16} />
                Create private league
              </h3>
              <span className="text-xs font-bold text-slate-500">
                {createdByMeCount}/{MAX_CREATED_LEAGUES} created
              </span>
            </div>

            {!isTournamentParticipant ? (
              <p className="mt-3 text-sm text-slate-600">Join the tournament before creating or requesting private leagues.</p>
            ) : (
              <div className="mt-3 grid gap-3">
                <input
                  value={leagueName}
                  onChange={(event) => setLeagueName(event.target.value)}
                  className="h-10 rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-blue-500"
                  placeholder="League name"
                  maxLength={80}
                />
                <textarea
                  value={leagueDescription}
                  onChange={(event) => setLeagueDescription(event.target.value)}
                  className="min-h-20 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                  placeholder="Optional description"
                  maxLength={500}
                />
                <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={leagueVisibility === 'unlisted'}
                    onChange={(event) => setLeagueVisibility(event.target.checked ? 'unlisted' : 'discoverable')}
                  />
                  Keep this league unlisted
                </label>
                <button
                  disabled={busyKey === 'create-league' || createdByMeCount >= MAX_CREATED_LEAGUES}
                  onClick={handleCreateLeague}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-blue-600 px-3 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Plus size={16} />
                  Create league
                </button>
              </div>
            )}
          </div>

          <div className="rounded-lg border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-4 py-3">
              <h3 className="font-bold">{tab === 'myLeagues' ? 'My private leagues' : 'Tournament private leagues'}</h3>
            </div>
            <div className="grid gap-2 p-3">
              {visibleLeagues.length === 0 ? (
                <p className="px-1 py-2 text-sm text-slate-500">
                  {tab === 'myLeagues' ? 'You have not joined a private league yet.' : 'No private leagues are visible yet.'}
                </p>
              ) : (
                visibleLeagues.map((league) => {
                  const leagueMemberRows = leagueMembers.filter((member) => member.league_id === league.id);
                  const activeCount = leagueMemberRows.filter((member) => member.status === 'active').length;
                  const myMemberRow = leagueMemberRows.find((member) => member.profile_id === session.user.id);
                  const isActiveOrInvitedMember = Boolean(myMemberRow && ['active', 'invited'].includes(myMemberRow.status));
                  const myRequests = joinRequests.filter((request) => request.league_id === league.id && request.requester_profile_id === session.user.id);
                  const pendingRequest = myRequests.find((request) => request.status === 'pending');
                  const attempts = myRequests.reduce((max, request) => Math.max(max, request.attempt_number), 0);
                  const requestLimitReached = attempts >= MAX_JOIN_REQUEST_ATTEMPTS;
                  const canRequest =
                    league.visibility === 'discoverable' &&
                    isTournamentParticipant &&
                    !isActiveOrInvitedMember &&
                    !pendingRequest &&
                    !requestLimitReached;

                  return (
                    <article
                      key={league.id}
                      className={`rounded-md border p-3 ${
                        selectedLeague?.id === league.id ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-white'
                      }`}
                    >
                      <button
                        onClick={() => setSelectedLeagueId(league.id)}
                        className="w-full text-left"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-bold">{league.name}</p>
                            <p className="mt-1 text-xs text-slate-500">
                              {activeCount} active member{activeCount === 1 ? '' : 's'}
                            </p>
                          </div>
                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600">
                            {league.visibility === 'unlisted' ? <EyeOff size={12} /> : <Eye size={12} />}
                            {league.visibility}
                          </span>
                        </div>
                        {league.description && <p className="mt-2 line-clamp-2 text-sm text-slate-600">{league.description}</p>}
                      </button>

                      <div className="mt-3 flex flex-wrap gap-2 text-xs">
                        {myMemberRow?.status === 'invited' && (
                          <>
                            <button
                              disabled={busyKey === `accept-${league.id}`}
                              onClick={() => handleAcceptInvite(league)}
                              className="inline-flex items-center gap-1 rounded-md bg-green-600 px-2.5 py-1.5 font-bold text-white hover:bg-green-700 disabled:opacity-60"
                            >
                              <Check size={13} />
                              Accept
                            </button>
                            <button
                              disabled={busyKey === `decline-${league.id}`}
                              onClick={() => handleDeclineInvite(league)}
                              className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2.5 py-1.5 font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                            >
                              <X size={13} />
                              Decline
                            </button>
                          </>
                        )}
                        {canRequest && (
                          <button
                            disabled={busyKey === `request-${league.id}`}
                            onClick={() => handleRequestJoin(league)}
                            className="inline-flex items-center gap-1 rounded-md border border-blue-300 px-2.5 py-1.5 font-bold text-blue-700 hover:bg-blue-50 disabled:opacity-60"
                          >
                            <UserPlus size={13} />
                            Request join
                          </button>
                        )}
                        {pendingRequest && <span className="rounded-full bg-amber-100 px-2.5 py-1.5 font-bold text-amber-800">Request pending</span>}
                        {requestLimitReached && !myMemberRow && !pendingRequest && (
                          <span className="rounded-full bg-slate-100 px-2.5 py-1.5 font-bold text-slate-600">Request limit reached</span>
                        )}
                        {canTournamentAdmin && league.visibility === 'unlisted' && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1.5 font-bold text-slate-700">
                            <Shield size={13} />
                            Tournament admin view
                          </span>
                        )}
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          </div>
        </div>

        <div className="min-w-0">
          {message && (
            <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-950">
              {message}
            </div>
          )}

          {!selectedLeague ? (
            <div className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-500">
              Select or create a private league to view standings and members.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg border border-slate-200 bg-white p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-xl font-black">{selectedLeague.name}</h3>
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">
                        {selectedLeague.visibility === 'unlisted' ? <EyeOff size={12} /> : <Eye size={12} />}
                        {selectedLeague.visibility}
                      </span>
                    </div>
                    {selectedLeague.description && <p className="mt-2 text-sm text-slate-600">{selectedLeague.description}</p>}
                    <p className="mt-2 text-xs text-slate-500">
                      Created {formatDateTime(selectedLeague.created_at)} by{' '}
                      {profileById.get(selectedLeague.created_by)?.display_name ?? 'Unknown participant'}.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={shareSelectedLeague}
                      className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 px-3 text-sm font-bold text-slate-700 hover:bg-slate-50"
                    >
                      <Share2 size={15} />
                      Share
                    </button>
                    <button
                      onClick={shareSelectedLeagueImage}
                      disabled={isSharingStandingsImage || selectedStandings.length === 0}
                      className="inline-flex h-9 items-center gap-2 rounded-md bg-blue-700 px-3 text-sm font-bold text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-slate-300"
                    >
                      <BarChart3 size={15} />
                      {isSharingStandingsImage ? 'Preparing...' : 'Share image'}
                    </button>
                    <button
                      onClick={exportSelectedLeague}
                      className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 px-3 text-sm font-bold text-slate-700 hover:bg-slate-50"
                    >
                      <Download size={15} />
                      Export CSV
                    </button>
                  </div>
                </div>

                {selectedMyMembership?.status === 'invited' && (
                  <div className="mt-4 flex flex-wrap items-center gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                    <span className="font-bold">You have been invited to this league.</span>
                    <button
                      disabled={busyKey === `accept-${selectedLeague.id}`}
                      onClick={() => handleAcceptInvite(selectedLeague)}
                      className="inline-flex h-8 items-center gap-1 rounded-md bg-green-600 px-2.5 text-xs font-bold text-white hover:bg-green-700 disabled:opacity-60"
                    >
                      <Check size={13} />
                      Accept
                    </button>
                    <button
                      disabled={busyKey === `decline-${selectedLeague.id}`}
                      onClick={() => handleDeclineInvite(selectedLeague)}
                      className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-300 px-2.5 text-xs font-bold text-slate-700 hover:bg-white disabled:opacity-60"
                    >
                      <X size={13} />
                      Decline
                    </button>
                  </div>
                )}

                {!selectedIsActiveOrInvitedMember && selectedLeague.visibility === 'discoverable' && (
                  <div className="mt-4 flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                    {selectedMyPendingRequest ? (
                      <span className="font-bold text-amber-800">Your join request is pending.</span>
                    ) : canRequestSelectedLeague ? (
                      <>
                        <span>Requests used: {selectedMyRequestAttempts}/{MAX_JOIN_REQUEST_ATTEMPTS}</span>
                        <button
                          disabled={busyKey === `request-${selectedLeague.id}`}
                          onClick={() => handleRequestJoin(selectedLeague)}
                          className="inline-flex h-8 items-center gap-1 rounded-md bg-blue-600 px-2.5 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-60"
                        >
                          <UserPlus size={13} />
                          Request join
                        </button>
                      </>
                    ) : (
                      <span className="font-bold">Request limit reached for this league.</span>
                    )}
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-slate-200 bg-white">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
                  <h3 className="font-bold">Private League Standings</h3>
                  <span className="text-xs font-bold text-slate-500">{selectedActiveMembers.length} active members</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                      <tr>
                        <th className="px-4 py-3">Rank</th>
                        <th className="px-4 py-3">Participant</th>
                        <th className="px-4 py-3">Points</th>
                        <th className="px-4 py-3">Correct</th>
                        <th className="px-4 py-3">Settled Votes</th>
                        <th className="px-4 py-3">Accuracy</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selectedStandings.length === 0 ? (
                        <tr>
                          <td className="px-4 py-4 text-slate-500" colSpan={6}>
                            No active members have standings yet.
                          </td>
                        </tr>
                      ) : (
                        selectedStandings.map((row, index) => (
                          <tr key={`${selectedLeague.id}-${row.user_id}`}>
                            <td className="px-4 py-3 font-bold">#{index + 1}</td>
                            <td className="px-4 py-3 font-semibold">{row.display_name}</td>
                            <td className="px-4 py-3 text-lg font-black text-blue-700">{row.total_points}</td>
                            <td className="px-4 py-3">{row.correct_picks}</td>
                            <td className="px-4 py-3">{row.settled_votes}</td>
                            <td className="px-4 py-3">{row.accuracy}%</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <div className="rounded-lg border border-slate-200 bg-white">
                  <div className="border-b border-slate-200 px-4 py-3">
                    <h3 className="font-bold">Members</h3>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {selectedMembers.length === 0 ? (
                      <p className="p-4 text-sm text-slate-500">No members yet.</p>
                    ) : (
                      selectedMembers
                        .slice()
                        .sort((a, b) => {
                          const statusOrder = { active: 0, invited: 1, declined: 2, removed: 3 } as Record<string, number>;
                          return (
                            (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9) ||
                            (profileById.get(a.profile_id)?.display_name ?? '').localeCompare(profileById.get(b.profile_id)?.display_name ?? '')
                          );
                        })
                        .map((member) => (
                          <div key={member.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                            <div>
                              <p className="font-bold">{profileById.get(member.profile_id)?.display_name ?? 'Unknown participant'}</p>
                              <p className="mt-1 text-xs capitalize text-slate-500">
                                {member.role} - {member.status}
                              </p>
                            </div>
                            {canManageSelectedLeague && member.role !== 'owner' && ['active', 'invited'].includes(member.status) && (
                              <button
                                disabled={busyKey === `remove-${member.id}`}
                                onClick={() => handleRemoveMember(member)}
                                className="inline-flex h-8 items-center gap-1 rounded-md border border-red-200 px-2.5 text-xs font-bold text-red-700 hover:bg-red-50 disabled:opacity-60"
                              >
                                <Trash2 size={13} />
                                Remove
                              </button>
                            )}
                          </div>
                        ))
                    )}
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 bg-white">
                  <div className="border-b border-slate-200 px-4 py-3">
                    <h3 className="font-bold">Admin tools</h3>
                  </div>

                  {canManageSelectedLeague ? (
                    <div className="grid gap-4 p-4">
                      <div id="invite-friends" className="scroll-mt-6">
                        <p className="flex items-center gap-2 text-sm font-bold">
                          <Mail size={15} />
                          Invite friend by email
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          New friends will create or sign in to FanVerdict and then join this tournament and private league automatically.
                        </p>
                        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                          <input
                            type="email"
                            value={inviteEmail}
                            onChange={(event) => setInviteEmail(event.target.value)}
                            className="h-10 min-w-0 flex-1 rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-blue-500"
                            placeholder="friend@example.com"
                          />
                          <button
                            disabled={!inviteEmailLooksValid || busyKey === `invite-email-${selectedLeague.id}`}
                            onClick={handleInviteFriendByEmail}
                            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-blue-600 px-3 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <Send size={15} />
                            Send invite
                          </button>
                        </div>
                      </div>

                      <div>
                        <p className="text-sm font-bold">Invite existing tournament participant</p>
                        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                          <select
                            value={inviteProfileId}
                            onChange={(event) => setInviteProfileId(event.target.value)}
                            className="h-10 min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-3 text-sm"
                          >
                            <option value="">Select participant</option>
                            {invitableProfiles.map((profile) => (
                              <option key={profile.id} value={profile.id}>
                                {profile.display_name}
                              </option>
                            ))}
                          </select>
                          <button
                            disabled={!inviteProfileId || busyKey === `invite-${selectedLeague.id}`}
                            onClick={handleInviteMember}
                            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-blue-600 px-3 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <Send size={15} />
                            Invite
                          </button>
                        </div>
                      </div>

                      <div>
                        <p className="text-sm font-bold">Join requests</p>
                        <div className="mt-2 grid gap-2">
                          {selectedPendingRequests.length === 0 ? (
                            <p className="text-sm text-slate-500">No pending requests.</p>
                          ) : (
                            selectedPendingRequests.map((request) => (
                              <div key={request.id} className="rounded-md border border-slate-200 p-3">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div>
                                    <p className="font-bold">
                                      {profileById.get(request.requester_profile_id)?.display_name ?? 'Unknown participant'}
                                    </p>
                                    <p className="mt-1 text-xs text-slate-500">
                                      Attempt {request.attempt_number}/{MAX_JOIN_REQUEST_ATTEMPTS} - {formatDateTime(request.created_at)}
                                    </p>
                                  </div>
                                  <div className="flex gap-2">
                                    <button
                                      disabled={busyKey === `review-${request.id}-approved`}
                                      onClick={() => handleReviewRequest(request, 'approved')}
                                      className="inline-flex h-8 items-center gap-1 rounded-md bg-green-600 px-2.5 text-xs font-bold text-white hover:bg-green-700 disabled:opacity-60"
                                    >
                                      <Check size={13} />
                                      Approve
                                    </button>
                                    <button
                                      disabled={busyKey === `review-${request.id}-rejected`}
                                      onClick={() => handleReviewRequest(request, 'rejected')}
                                      className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-300 px-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                                    >
                                      <X size={13} />
                                      Reject
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="p-4 text-sm text-slate-500">Private league admins can invite participants and process join requests.</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
