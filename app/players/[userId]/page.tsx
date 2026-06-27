"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { ArrowLeft, BarChart3, CheckCircle2, CircleSlash, ListChecks, Trophy, XCircle } from 'lucide-react';
import { getErrorMessage } from '@/lib/errors';
import { calculateStandings, formatDateTime, optionLabel, sortPollsByGameOrder } from '@/lib/fanverdict';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import type { PointsLedger, Poll, Profile, Tournament, TournamentMember, Vote } from '@/lib/types';

type LoadState = 'idle' | 'loading' | 'ready' | 'error';
type PlayerPickStatus = 'correct' | 'incorrect' | 'missed';

type PlayerPollBreakdown = {
  pollId: string;
  label: string;
  question: string;
  locksAt: string;
  settledAt: string | null;
  selectedLabel: string | null;
  resultLabel: string;
  status: PlayerPickStatus;
  points: number;
  pointsAvailable: number;
};

function formatLedgerReason(reason: PointsLedger['reason']) {
  if (reason === 'correct_pick') return 'Correct pick';
  if (reason === 'manual_adjustment') return 'Manual adjustment';
  return 'Historical import';
}

function deltaLabel(delta: number) {
  return delta > 0 ? `+${delta}` : String(delta);
}

export default function PlayerPointBreakdownPage({ params }: { params: { userId: string } }) {
  const playerId = params.userId;
  const [session, setSession] = useState<Session | null>(null);
  const [redirectTarget, setRedirectTarget] = useState('/');
  const [tournamentId, setTournamentId] = useState('');
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [members, setMembers] = useState<TournamentMember[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [polls, setPolls] = useState<Poll[]>([]);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [ledger, setLedger] = useState<PointsLedger[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('idle');
  const [message, setMessage] = useState('');

  const backHref = tournamentId ? `/?tournament=${tournamentId}#live-standings` : '/';

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    setTournamentId(searchParams.get('tournament') ?? '');
    setRedirectTarget(`${window.location.pathname}${window.location.search}`);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));

    return () => subscription.unsubscribe();
  }, []);

  const loadPlayerData = useCallback(
    async (selectedTournamentId: string) => {
      if (!selectedTournamentId) return;

      setLoadState('loading');
      setMessage('');

      try {
        const [tournamentResult, membersResult, pollsResult, ledgerResult] = await Promise.all([
          supabase.from('tournaments').select('*').eq('id', selectedTournamentId).single(),
          supabase.from('tournament_members').select('*').eq('tournament_id', selectedTournamentId),
          supabase
            .from('polls')
            .select('*, matches(*), poll_options(*)')
            .eq('tournament_id', selectedTournamentId)
            .order('locks_at', { ascending: true }),
          supabase.from('points_ledger').select('*').eq('tournament_id', selectedTournamentId),
        ]);

        if (tournamentResult.error) throw tournamentResult.error;
        if (membersResult.error) throw membersResult.error;
        if (pollsResult.error) throw pollsResult.error;
        if (ledgerResult.error) throw ledgerResult.error;

        const loadedMembers = (membersResult.data ?? []) as TournamentMember[];
        const loadedPolls = sortPollsByGameOrder((pollsResult.data ?? []) as Poll[]);
        const loadedLedger = (ledgerResult.data ?? []) as PointsLedger[];
        const userIds = Array.from(new Set([...loadedMembers.map((member) => member.user_id), playerId]));
        const pollIds = loadedPolls.map((poll) => poll.id);

        let loadedProfiles: Profile[] = [];
        let loadedVotes: Vote[] = [];

        if (userIds.length > 0) {
          const profilesResult = await supabase.from('profiles').select('*').in('id', userIds);
          if (profilesResult.error) throw profilesResult.error;
          loadedProfiles = (profilesResult.data ?? []) as Profile[];
        }

        if (pollIds.length > 0) {
          const votesResult = await supabase.from('votes').select('*').in('poll_id', pollIds).order('updated_at', { ascending: false });
          if (votesResult.error) throw votesResult.error;
          loadedVotes = (votesResult.data ?? []) as Vote[];
        }

        setTournament(tournamentResult.data as Tournament);
        setMembers(loadedMembers);
        setProfiles(loadedProfiles);
        setPolls(loadedPolls);
        setVotes(loadedVotes);
        setLedger(loadedLedger);
        setLoadState('ready');
      } catch (error) {
        setLoadState('error');
        setMessage(getErrorMessage(error, 'Unable to load player point details.'));
      }
    },
    [playerId],
  );

  useEffect(() => {
    if (!session || !tournamentId) return;
    loadPlayerData(tournamentId);
  }, [loadPlayerData, session, tournamentId]);

  const standings = useMemo(() => calculateStandings(members, profiles, votes, polls, ledger), [ledger, members, polls, profiles, votes]);
  const playerStanding = useMemo(() => standings.find((row) => row.user_id === playerId) ?? null, [playerId, standings]);
  const playerRank = useMemo(() => standings.findIndex((row) => row.user_id === playerId) + 1, [playerId, standings]);
  const playerProfile = useMemo(() => profiles.find((profile) => profile.id === playerId) ?? null, [playerId, profiles]);
  const pollById = useMemo(() => new Map(polls.map((poll) => [poll.id, poll])), [polls]);
  const playerVotesByPoll = useMemo(
    () => new Map(votes.filter((vote) => vote.user_id === playerId).map((vote) => [vote.poll_id, vote])),
    [playerId, votes],
  );
  const playerLedger = useMemo(
    () =>
      ledger
        .filter((entry) => entry.user_id === playerId)
        .slice()
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [ledger, playerId],
  );
  const pointsByPoll = useMemo(() => {
    const points = new Map<string, number>();

    for (const entry of playerLedger) {
      if (!entry.poll_id) continue;
      points.set(entry.poll_id, (points.get(entry.poll_id) ?? 0) + entry.delta);
    }

    return points;
  }, [playerLedger]);
  const pollBreakdown = useMemo<PlayerPollBreakdown[]>(
    () =>
      sortPollsByGameOrder(polls.filter((poll) => poll.status === 'settled' && Boolean(poll.result_option_id))).map((poll, index) => {
        const vote = playerVotesByPoll.get(poll.id);
        const selectedLabel = vote ? optionLabel(poll, vote.selected_option_id) : null;
        const status: PlayerPickStatus = !vote ? 'missed' : vote.selected_option_id === poll.result_option_id ? 'correct' : 'incorrect';
        const gameNumber = poll.matches?.game_number;

        return {
          pollId: poll.id,
          label: gameNumber ? `Game ${gameNumber}` : `Poll ${index + 1}`,
          question: poll.question,
          locksAt: poll.locks_at,
          settledAt: poll.settled_at,
          selectedLabel,
          resultLabel: optionLabel(poll, poll.result_option_id),
          status,
          points: pointsByPoll.get(poll.id) ?? 0,
          pointsAvailable: poll.points_per_correct || 1,
        };
      }),
    [playerVotesByPoll, pointsByPoll, polls],
  );
  const totals = useMemo(() => {
    const ledgerTotal = playerLedger.reduce((total, entry) => total + entry.delta, 0);
    const correctPickPoints = playerLedger
      .filter((entry) => entry.reason === 'correct_pick')
      .reduce((total, entry) => total + entry.delta, 0);
    const adjustmentPoints = ledgerTotal - correctPickPoints;

    return {
      ledgerTotal,
      correctPickPoints,
      adjustmentPoints,
      incorrectPicks: pollBreakdown.filter((row) => row.status === 'incorrect').length,
      missedPicks: pollBreakdown.filter((row) => row.status === 'missed').length,
    };
  }, [playerLedger, pollBreakdown]);

  const playerName = playerStanding?.display_name ?? playerProfile?.display_name ?? 'Unknown player';

  if (!isSupabaseConfigured) {
    return (
      <main className="min-h-screen bg-slate-50 p-6">
        <div className="mx-auto max-w-3xl rounded-lg border border-amber-200 bg-amber-50 p-6 text-amber-950">
          <h1 className="text-xl font-bold">Supabase environment is missing</h1>
          <p className="mt-2 text-sm">Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY before viewing player details.</p>
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <nav className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <a href="/" className="flex items-center gap-2 text-lg font-bold">
            <Trophy className="text-blue-600" size={24} />
            FanVerdict
          </a>
          <a
            href={backHref}
            className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 px-3 text-sm font-semibold hover:bg-slate-100"
          >
            <ArrowLeft size={16} />
            Back to standings
          </a>
        </div>
      </nav>

      <main className="mx-auto max-w-7xl px-4 py-6">
        {!session ? (
          <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            <h1 className="text-xl font-bold">Sign in to view player details</h1>
            <p className="mt-2 text-sm text-slate-600">Player point breakdowns are available from the tournament dashboard after sign-in.</p>
            <a
              href={`/login?redirect=${encodeURIComponent(redirectTarget)}`}
              className="mt-4 inline-flex h-10 items-center rounded-md bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700"
            >
              Sign in
            </a>
          </section>
        ) : !tournamentId ? (
          <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            <h1 className="text-xl font-bold">Tournament missing</h1>
            <p className="mt-2 text-sm text-slate-600">Open this page from a player name in the tournament standings.</p>
          </section>
        ) : (
          <div className="space-y-6">
            {message && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-950">
                {message}
              </div>
            )}

            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase text-blue-600">{tournament?.name ?? 'Tournament'}</p>
                  <h1 className="mt-1 text-2xl font-black">{playerName}</h1>
                  <p className="mt-2 text-sm text-slate-600">
                    {playerRank > 0 ? `Rank #${playerRank} of ${standings.length}.` : 'Player is not currently ranked in this tournament.'}
                  </p>
                </div>
                <a
                  href={backHref}
                  className="inline-flex h-10 items-center gap-2 rounded-md bg-slate-900 px-3 text-sm font-bold text-white hover:bg-slate-800"
                >
                  <ArrowLeft size={16} />
                  Player standings
                </a>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <div className="rounded-md border border-slate-200 p-4">
                  <p className="text-xs font-semibold uppercase text-slate-500">Total Points</p>
                  <p className="mt-1 text-2xl font-black text-blue-700">{playerStanding?.total_points ?? totals.ledgerTotal}</p>
                </div>
                <div className="rounded-md border border-slate-200 p-4">
                  <p className="text-xs font-semibold uppercase text-slate-500">Correct Picks</p>
                  <p className="mt-1 text-2xl font-black">{playerStanding?.correct_picks ?? 0}</p>
                </div>
                <div className="rounded-md border border-slate-200 p-4">
                  <p className="text-xs font-semibold uppercase text-slate-500">Incorrect</p>
                  <p className="mt-1 text-2xl font-black">{totals.incorrectPicks}</p>
                </div>
                <div className="rounded-md border border-slate-200 p-4">
                  <p className="text-xs font-semibold uppercase text-slate-500">Missed</p>
                  <p className="mt-1 text-2xl font-black">{totals.missedPicks}</p>
                </div>
                <div className="rounded-md border border-slate-200 p-4">
                  <p className="text-xs font-semibold uppercase text-slate-500">Accuracy</p>
                  <p className="mt-1 text-2xl font-black">{playerStanding?.accuracy ?? 0}%</p>
                </div>
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
                <h2 className="flex items-center gap-2 font-bold">
                  <BarChart3 size={18} />
                  Game Point Breakdown
                </h2>
                <span className="text-sm text-slate-500">
                  {pollBreakdown.length} settled poll{pollBreakdown.length === 1 ? '' : 's'}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-5 py-3">Game</th>
                      <th className="px-5 py-3">Poll</th>
                      <th className="px-5 py-3">Player Pick</th>
                      <th className="px-5 py-3">Result</th>
                      <th className="px-5 py-3">Outcome</th>
                      <th className="px-5 py-3 text-right">Points</th>
                      <th className="px-5 py-3">Settled</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {loadState === 'loading' ? (
                      <tr>
                        <td className="px-5 py-4 text-slate-500" colSpan={7}>
                          Loading player point details...
                        </td>
                      </tr>
                    ) : pollBreakdown.length === 0 ? (
                      <tr>
                        <td className="px-5 py-4 text-slate-500" colSpan={7}>
                          No settled polls are available yet.
                        </td>
                      </tr>
                    ) : (
                      pollBreakdown.map((row) => (
                        <tr key={row.pollId}>
                          <td className="px-5 py-3">
                            <p className="font-bold">{row.label}</p>
                            <p className="mt-1 text-xs text-slate-500">Locked {formatDateTime(row.locksAt)}</p>
                          </td>
                          <td className="px-5 py-3 font-semibold">{row.question}</td>
                          <td className="px-5 py-3">{row.selectedLabel ?? 'No vote'}</td>
                          <td className="px-5 py-3 font-semibold text-green-700">{row.resultLabel}</td>
                          <td className="px-5 py-3">
                            <span
                              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold uppercase ${
                                row.status === 'correct'
                                  ? 'bg-green-100 text-green-700'
                                  : row.status === 'incorrect'
                                    ? 'bg-red-100 text-red-700'
                                    : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {row.status === 'correct' ? (
                                <CheckCircle2 size={13} />
                              ) : row.status === 'incorrect' ? (
                                <XCircle size={13} />
                              ) : (
                                <CircleSlash size={13} />
                              )}
                              {row.status}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-right font-black text-blue-700">
                            {row.points} / {row.pointsAvailable}
                          </td>
                          <td className="px-5 py-3">{formatDateTime(row.settledAt)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
                <h2 className="flex items-center gap-2 font-bold">
                  <ListChecks size={18} />
                  Point Ledger
                </h2>
                <div className="flex flex-wrap gap-2 text-xs font-semibold">
                  <span className="rounded-full bg-green-100 px-2.5 py-1 text-green-800">
                    Picks {deltaLabel(totals.correctPickPoints)}
                  </span>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">
                    Adjustments {deltaLabel(totals.adjustmentPoints)}
                  </span>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-5 py-3">Date</th>
                      <th className="px-5 py-3">Reason</th>
                      <th className="px-5 py-3">Source</th>
                      <th className="px-5 py-3">Note</th>
                      <th className="px-5 py-3 text-right">Delta</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {playerLedger.length === 0 ? (
                      <tr>
                        <td className="px-5 py-4 text-slate-500" colSpan={5}>
                          No point ledger entries for this player yet.
                        </td>
                      </tr>
                    ) : (
                      playerLedger.map((entry) => {
                        const poll = entry.poll_id ? pollById.get(entry.poll_id) : null;
                        const sourceLabel = poll?.matches?.game_number
                          ? `Game ${poll.matches.game_number}`
                          : poll
                            ? poll.question
                            : 'Tournament adjustment';

                        return (
                          <tr key={entry.id}>
                            <td className="px-5 py-3">{formatDateTime(entry.created_at)}</td>
                            <td className="px-5 py-3 font-semibold">{formatLedgerReason(entry.reason)}</td>
                            <td className="px-5 py-3">{sourceLabel}</td>
                            <td className="px-5 py-3 text-slate-600">{entry.note ?? '-'}</td>
                            <td className={`px-5 py-3 text-right font-black ${entry.delta >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                              {deltaLabel(entry.delta)}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
