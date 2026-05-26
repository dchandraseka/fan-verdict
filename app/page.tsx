"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  BarChart3,
  CalendarClock,
  LogOut,
  Mail,
  RefreshCcw,
  Settings,
  Share2,
  Shield,
  Trophy,
  Users,
} from 'lucide-react';
import { ensureProfile } from '@/lib/account';
import { getErrorMessage } from '@/lib/errors';
import { calculateStandings, formatDateTime, isPollLocked, optionLabel, sortedPollOptions } from '@/lib/fanverdict';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import type { PointsLedger, Poll, Profile, Tournament, TournamentMember, Vote } from '@/lib/types';

type LoadState = 'idle' | 'loading' | 'ready' | 'error';

export default function Dashboard() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [selectedTournamentId, setSelectedTournamentId] = useState('');
  const [members, setMembers] = useState<TournamentMember[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [polls, setPolls] = useState<Poll[]>([]);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [ledger, setLedger] = useState<PointsLedger[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('idle');
  const [message, setMessage] = useState('');

  const currentTournament = useMemo(
    () => tournaments.find((tournament) => tournament.id === selectedTournamentId) ?? null,
    [selectedTournamentId, tournaments],
  );

  const myMembership = useMemo(
    () => members.find((member) => member.user_id === session?.user.id && member.status === 'active') ?? null,
    [members, session?.user.id],
  );

  const canAdmin = myMembership?.role === 'owner' || myMembership?.role === 'admin';

  const profileById = useMemo(() => new Map(profiles.map((item) => [item.id, item])), [profiles]);
  const pollById = useMemo(() => new Map(polls.map((poll) => [poll.id, poll])), [polls]);

  const myVotes = useMemo(() => {
    const voteMap = new Map<string, Vote>();
    for (const vote of votes) {
      if (vote.user_id === session?.user.id) voteMap.set(vote.poll_id, vote);
    }
    return voteMap;
  }, [session?.user.id, votes]);

  const standings = useMemo(
    () => calculateStandings(members, profiles, votes, polls, ledger),
    [ledger, members, polls, profiles, votes],
  );

  const openPolls = useMemo(
    () =>
      polls
        .filter((poll) => poll.status !== 'settled' && poll.status !== 'cancelled')
        .sort((a, b) => new Date(a.locks_at).getTime() - new Date(b.locks_at).getTime()),
    [polls],
  );

  const recentVotes = useMemo(
    () =>
      votes
        .slice()
        .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
        .slice(0, 25),
    [votes],
  );

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));

    return () => subscription.unsubscribe();
  }, []);

  const loadTournaments = useCallback(
    async (activeSession: Session) => {
      setLoadState('loading');
      setMessage('');

      try {
        const [loadedProfile, tournamentResult] = await Promise.all([
          ensureProfile(activeSession),
          supabase.from('tournaments').select('*').order('created_at', { ascending: false }),
        ]);

        if (tournamentResult.error) throw tournamentResult.error;

        const loadedTournaments = (tournamentResult.data ?? []) as Tournament[];
        setProfile(loadedProfile);
        setTournaments(loadedTournaments);

        if (!selectedTournamentId && loadedTournaments.length > 0) {
          setSelectedTournamentId(loadedTournaments[0].id);
        }

        setLoadState('ready');
      } catch (error) {
        setLoadState('error');
        setMessage(getErrorMessage(error, 'Unable to load tournaments.'));
      }
    },
    [selectedTournamentId],
  );

  const loadTournamentData = useCallback(async (tournamentId: string) => {
    if (!tournamentId) return;

    setLoadState('loading');
    setMessage('');

    try {
      const [membersResult, pollsResult, ledgerResult] = await Promise.all([
        supabase.from('tournament_members').select('*').eq('tournament_id', tournamentId),
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

      const loadedMembers = (membersResult.data ?? []) as TournamentMember[];
      const loadedPolls = (pollsResult.data ?? []) as Poll[];
      const loadedLedger = (ledgerResult.data ?? []) as PointsLedger[];
      const userIds = Array.from(new Set(loadedMembers.map((member) => member.user_id)));
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

      setMembers(loadedMembers);
      setPolls(loadedPolls);
      setLedger(loadedLedger);
      setProfiles(loadedProfiles);
      setVotes(loadedVotes);
      setLoadState('ready');
    } catch (error) {
      setLoadState('error');
      setMessage(getErrorMessage(error, 'Unable to load tournament data.'));
    }
  }, []);

  useEffect(() => {
    if (!session) {
      setProfile(null);
      setTournaments([]);
      setSelectedTournamentId('');
      setMembers([]);
      setProfiles([]);
      setPolls([]);
      setVotes([]);
      setLedger([]);
      setLoadState('ready');
      return;
    }

    loadTournaments(session);
  }, [loadTournaments, session]);

  useEffect(() => {
    if (selectedTournamentId) loadTournamentData(selectedTournamentId);
  }, [loadTournamentData, selectedTournamentId]);

  const handleJoinTournament = async () => {
    if (!session || !currentTournament) return;

    setMessage('');
    const { error } = await supabase.from('tournament_members').insert({
      tournament_id: currentTournament.id,
      user_id: session.user.id,
      role: 'participant',
      status: 'active',
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    await loadTournamentData(currentTournament.id);
    setMessage(`Joined ${currentTournament.name}.`);
  };

  const handleVote = async (poll: Poll, selectedOptionId: string) => {
    if (!session) {
      setMessage('Please sign in before voting.');
      return;
    }

    if (isPollLocked(poll)) {
      setMessage('This poll is locked. Votes can only be changed before the match begins.');
      return;
    }

    const now = new Date().toISOString();
    const { error } = await supabase.from('votes').upsert(
      {
        poll_id: poll.id,
        user_id: session.user.id,
        selected_option_id: selectedOptionId,
        voted_at: now,
        updated_at: now,
      },
      { onConflict: 'poll_id,user_id' },
    );

    if (error) {
      setMessage(error.message);
      return;
    }

    await loadTournamentData(poll.tournament_id);
    setMessage(`Vote saved for ${optionLabel(poll, selectedOptionId)}.`);
  };

  const handleShare = async () => {
    const shareUrl = window.location.href;
    const shareText = `FanVerdict standings for ${currentTournament?.name ?? 'our tournament'}: ${shareUrl}`;

    if (navigator.share) {
      await navigator.share({ title: 'FanVerdict', text: shareText, url: shareUrl });
      return;
    }

    await navigator.clipboard?.writeText(shareText);
    setMessage('Dashboard link copied.');
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setMessage('');
  };

  if (!isSupabaseConfigured) {
    return (
      <main className="min-h-screen bg-slate-50 p-6">
        <div className="mx-auto max-w-3xl rounded-lg border border-amber-200 bg-amber-50 p-6 text-amber-950">
          <h1 className="text-xl font-bold">Supabase environment is missing</h1>
          <p className="mt-2 text-sm">
            Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to your local environment before running
            the app.
          </p>
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

          <div className="flex flex-wrap items-center gap-2">
            {currentTournament && (
              <select
                value={selectedTournamentId}
                onChange={(event) => setSelectedTournamentId(event.target.value)}
                className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm"
              >
                {tournaments.map((tournament) => (
                  <option key={tournament.id} value={tournament.id}>
                    {tournament.name}
                    {tournament.season_year ? ` (${tournament.season_year})` : ''} - created {formatDateTime(tournament.created_at)}
                  </option>
                ))}
              </select>
            )}

            {canAdmin && (
              <a
                href="/admin"
                className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 px-3 text-sm font-semibold hover:bg-slate-100"
              >
                <Shield size={16} />
                Admin
              </a>
            )}

            {session && (
              <a
                href="/account"
                className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 px-3 text-sm font-semibold hover:bg-slate-100"
              >
                <Settings size={16} />
                Account
              </a>
            )}

            {session ? (
              <button
                onClick={handleLogout}
                className="inline-flex h-10 items-center gap-2 rounded-md bg-slate-900 px-3 text-sm font-semibold text-white hover:bg-slate-800"
              >
                <LogOut size={16} />
                Sign out
              </button>
            ) : (
              <a
                href="/login"
                className="inline-flex h-10 items-center rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700"
              >
                Sign in
              </a>
            )}
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-7xl px-4 py-6">
        {message && (
          <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-950">
            {message}
          </div>
        )}

        {!session ? (
          <section className="grid gap-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-[1.4fr_1fr] md:items-center">
            <div>
              <h1 className="text-3xl font-bold tracking-normal">Run your IPL prediction game without spreadsheets.</h1>
              <p className="mt-3 max-w-2xl text-slate-600">
                Create tournaments, join your group, vote before each match locks, and track standings with timestamps
                for every vote.
              </p>
            </div>
            <div className="flex flex-col gap-2 md:items-end">
              <a
                href="/login"
                className="inline-flex h-11 items-center justify-center rounded-md bg-blue-600 px-5 text-sm font-bold text-white hover:bg-blue-700"
              >
                Create account or sign in
              </a>
              <span className="text-xs text-slate-500">Sign up with email and password. Phone is optional for alerts.</span>
            </div>
          </section>
        ) : tournaments.length === 0 && loadState !== 'loading' ? (
          <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            <h1 className="text-2xl font-bold">Create your first tournament</h1>
            <p className="mt-2 text-slate-600">
              No tournaments exist yet. Use the admin console to create IPL 2026; the creator becomes the tournament owner.
            </p>
            <a
              href="/admin"
              className="mt-4 inline-flex h-10 items-center rounded-md bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700"
            >
              Open admin console
            </a>
          </section>
        ) : (
          <div className="space-y-6">
            <section className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
              <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase text-blue-600">Current Tournament</p>
                    <h1 className="mt-1 text-2xl font-bold">{currentTournament?.name ?? 'Select a tournament'}</h1>
                    <p className="mt-2 text-sm text-slate-600">
                      Signed in as {profile?.display_name ?? session.user.email}.{' '}
                      {myMembership ? `Role: ${myMembership.role}.` : 'You have not joined this tournament.'}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {!myMembership && currentTournament && (
                      <button
                        onClick={handleJoinTournament}
                        className="inline-flex h-10 items-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700"
                      >
                        <Users size={16} />
                        Join tournament
                      </button>
                    )}
                    <button
                      onClick={() => currentTournament && loadTournamentData(currentTournament.id)}
                      className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 px-3 text-sm font-semibold hover:bg-slate-100"
                    >
                      <RefreshCcw size={16} />
                      Refresh
                    </button>
                  </div>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-md border border-slate-200 p-4">
                    <p className="text-xs font-semibold uppercase text-slate-500">Participants</p>
                    <p className="mt-1 text-2xl font-bold">{members.filter((member) => member.status === 'active').length}</p>
                  </div>
                  <div className="rounded-md border border-slate-200 p-4">
                    <p className="text-xs font-semibold uppercase text-slate-500">Open Polls</p>
                    <p className="mt-1 text-2xl font-bold">{openPolls.filter((poll) => !isPollLocked(poll)).length}</p>
                  </div>
                  <div className="rounded-md border border-slate-200 p-4">
                    <p className="text-xs font-semibold uppercase text-slate-500">Settled Polls</p>
                    <p className="mt-1 text-2xl font-bold">{polls.filter((poll) => poll.status === 'settled').length}</p>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="flex items-center gap-2 font-bold">
                  <Share2 size={18} />
                  Share dashboard
                </h2>
                <p className="mt-2 text-sm text-slate-600">Send the current standings link to the group.</p>
                <div className="mt-4 grid gap-2">
                  <button
                    onClick={handleShare}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-slate-900 px-3 text-sm font-bold text-white hover:bg-slate-800"
                  >
                    <Share2 size={16} />
                    Share or copy link
                  </button>
                  <a
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-300 px-3 text-sm font-semibold hover:bg-slate-100"
                    href={`https://wa.me/?text=${encodeURIComponent(`FanVerdict standings: ${typeof window !== 'undefined' ? window.location.href : ''}`)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    WhatsApp
                  </a>
                  <a
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-300 px-3 text-sm font-semibold hover:bg-slate-100"
                    href={`mailto:?subject=${encodeURIComponent('FanVerdict standings')}&body=${encodeURIComponent(typeof window !== 'undefined' ? window.location.href : '')}`}
                  >
                    <Mail size={16} />
                    Email
                  </a>
                </div>
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
                <h2 className="flex items-center gap-2 font-bold">
                  <CalendarClock size={18} />
                  Polls
                </h2>
                <span className="text-sm text-slate-500">Votes can be changed until the listed lock time.</span>
              </div>

              <div className="grid gap-4 p-5 lg:grid-cols-2">
                {openPolls.length === 0 ? (
                  <p className="text-sm text-slate-500">No open or locked polls yet.</p>
                ) : (
                  openPolls.map((poll) => {
                    const locked = isPollLocked(poll);
                    const currentVote = myVotes.get(poll.id);
                    const options = sortedPollOptions(poll);

                    return (
                      <article key={poll.id} className="rounded-lg border border-slate-200 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-xs font-bold uppercase text-slate-500">
                              {poll.matches?.game_number ? `Game ${poll.matches.game_number}` : 'Manual Poll'}
                            </p>
                            <h3 className="mt-1 text-lg font-bold">{poll.question}</h3>
                            <p className="mt-1 text-sm text-slate-600">Locks: {formatDateTime(poll.locks_at)}</p>
                            <p className="mt-1 text-xs font-semibold text-slate-500">
                              Worth {poll.points_per_correct || 1} point{(poll.points_per_correct || 1) === 1 ? '' : 's'}
                            </p>
                          </div>
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-bold uppercase ${
                              locked ? 'bg-slate-100 text-slate-600' : 'bg-green-100 text-green-700'
                            }`}
                          >
                            {locked ? poll.status : 'open'}
                          </span>
                        </div>

                        <div className="mt-4 grid gap-2 sm:grid-cols-2">
                          {options.map((option) => (
                            <button
                              key={option.id}
                              disabled={locked || !myMembership}
                              onClick={() => handleVote(poll, option.id)}
                              className={`min-h-12 rounded-md border px-3 py-2 text-sm font-bold transition ${
                                currentVote?.selected_option_id === option.id
                                  ? 'border-blue-600 bg-blue-50 text-blue-700'
                                  : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-50'
                              } disabled:cursor-not-allowed disabled:opacity-55`}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>

                        <p className="mt-3 text-xs text-slate-500">
                          Your vote: {currentVote ? `${optionLabel(poll, currentVote.selected_option_id)} at ${formatDateTime(currentVote.updated_at)}` : 'Not cast'}
                        </p>
                      </article>
                    );
                  })
                )}
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
                <h2 className="flex items-center gap-2 font-bold">
                  <BarChart3 size={18} />
                  Standings
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-5 py-3">Rank</th>
                      <th className="px-5 py-3">Participant</th>
                      <th className="px-5 py-3">Role</th>
                      <th className="px-5 py-3">Points</th>
                      <th className="px-5 py-3">Correct</th>
                      <th className="px-5 py-3">Settled Votes</th>
                      <th className="px-5 py-3">Accuracy</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {standings.map((row, index) => (
                      <tr key={row.user_id}>
                        <td className="px-5 py-3 font-bold">#{index + 1}</td>
                        <td className="px-5 py-3 font-semibold">{row.display_name}</td>
                        <td className="px-5 py-3 capitalize text-slate-600">{row.role}</td>
                        <td className="px-5 py-3 text-lg font-black text-blue-700">{row.total_points}</td>
                        <td className="px-5 py-3">{row.correct_picks}</td>
                        <td className="px-5 py-3">{row.settled_votes}</td>
                        <td className="px-5 py-3">{row.accuracy}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-5 py-4">
                <h2 className="font-bold">Vote Audit Log</h2>
                <p className="mt-1 text-sm text-slate-500">Every visible vote includes the participant and latest vote time.</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-5 py-3">Participant</th>
                      <th className="px-5 py-3">Poll</th>
                      <th className="px-5 py-3">Vote</th>
                      <th className="px-5 py-3">Voted At</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {recentVotes.length === 0 ? (
                      <tr>
                        <td className="px-5 py-4 text-slate-500" colSpan={4}>
                          No votes have been cast yet.
                        </td>
                      </tr>
                    ) : (
                      recentVotes.map((vote) => {
                        const poll = pollById.get(vote.poll_id);

                        return (
                          <tr key={vote.id}>
                            <td className="px-5 py-3 font-semibold">{profileById.get(vote.user_id)?.display_name ?? 'Unknown player'}</td>
                            <td className="px-5 py-3">{poll?.question ?? 'Poll removed'}</td>
                            <td className="px-5 py-3">{poll ? optionLabel(poll, vote.selected_option_id) : 'Unknown option'}</td>
                            <td className="px-5 py-3">{formatDateTime(vote.updated_at)}</td>
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

        {loadState === 'loading' && <p className="mt-4 text-sm text-slate-500">Loading latest FanVerdict data...</p>}
      </main>
    </div>
  );
}
