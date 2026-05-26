"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  CheckCircle2,
  Crown,
  Plus,
  RefreshCcw,
  Save,
  Settings,
  ShieldAlert,
  Trophy,
  Users,
} from 'lucide-react';
import { ensureProfile } from '@/lib/account';
import { formatDateTime, isPollLocked, optionLabel, sortedPollOptions } from '@/lib/fanverdict';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import type { Poll, Profile, Tournament, TournamentMember } from '@/lib/types';

function defaultDateTimeLocal() {
  const date = new Date(Date.now() + 24 * 60 * 60 * 1000);
  date.setSeconds(0, 0);

  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function toDateTimeLocal(value: string) {
  const date = new Date(value);
  date.setSeconds(0, 0);

  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function normalizeOptionLabels(values: string[]) {
  const labels = values.map((value) => value.trim()).filter(Boolean);
  const seen = new Set<string>();
  const uniqueLabels: string[] = [];

  for (const label of labels) {
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueLabels.push(label);
  }

  return uniqueLabels;
}

export default function AdminPortal() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [selectedTournamentId, setSelectedTournamentId] = useState('');
  const [members, setMembers] = useState<TournamentMember[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [polls, setPolls] = useState<Poll[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const [tournamentName, setTournamentName] = useState('');
  const [seasonYear, setSeasonYear] = useState('');

  const [matchQuestion, setMatchQuestion] = useState('');
  const [gameNumber, setGameNumber] = useState('');
  const [teamA, setTeamA] = useState('');
  const [teamB, setTeamB] = useState('');
  const [matchExtraOptions, setMatchExtraOptions] = useState<string[]>([]);
  const [startsAt, setStartsAt] = useState(defaultDateTimeLocal);
  const [venue, setVenue] = useState('');

  const [manualQuestion, setManualQuestion] = useState('');
  const [manualOptions, setManualOptions] = useState(['', '']);
  const [manualLocksAt, setManualLocksAt] = useState(defaultDateTimeLocal);

  const [resultPollId, setResultPollId] = useState('');
  const [resultOptionId, setResultOptionId] = useState('');
  const [resultPoints, setResultPoints] = useState('1');

  const [editPollId, setEditPollId] = useState('');
  const [editQuestion, setEditQuestion] = useState('');
  const [editVenue, setEditVenue] = useState('');
  const [editLocksAt, setEditLocksAt] = useState(defaultDateTimeLocal);
  const [editOptions, setEditOptions] = useState<string[]>(['', '']);

  const [adjustmentUserId, setAdjustmentUserId] = useState('');
  const [adjustmentDelta, setAdjustmentDelta] = useState('1');
  const [adjustmentNote, setAdjustmentNote] = useState('');

  const [promoteUserId, setPromoteUserId] = useState('');

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
  const selectedResultPoll = useMemo(
    () => polls.find((poll) => poll.id === resultPollId) ?? null,
    [polls, resultPollId],
  );
  const selectedResultOptions = useMemo(
    () => (selectedResultPoll ? sortedPollOptions(selectedResultPoll) : []),
    [selectedResultPoll],
  );
  const editablePolls = useMemo(
    () => polls.filter((poll) => poll.status === 'open' && !isPollLocked(poll)),
    [polls],
  );
  const selectedEditPoll = useMemo(
    () => editablePolls.find((poll) => poll.id === editPollId) ?? null,
    [editPollId, editablePolls],
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
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Unable to load admin data.');
      }
    },
    [selectedTournamentId],
  );

  const loadTournamentData = useCallback(async (tournamentId: string) => {
    if (!tournamentId) return;

    try {
      const [membersResult, pollsResult] = await Promise.all([
        supabase.from('tournament_members').select('*').eq('tournament_id', tournamentId).order('joined_at'),
        supabase
          .from('polls')
          .select('*, matches(*), poll_options(*)')
          .eq('tournament_id', tournamentId)
          .order('locks_at', { ascending: false }),
      ]);

      if (membersResult.error) throw membersResult.error;
      if (pollsResult.error) throw pollsResult.error;

      const loadedMembers = (membersResult.data ?? []) as TournamentMember[];
      const userIds = Array.from(new Set(loadedMembers.map((member) => member.user_id)));
      const profilesResult = userIds.length
        ? await supabase.from('profiles').select('*').in('id', userIds)
        : { data: [], error: null };

      if (profilesResult.error) throw profilesResult.error;

      setMembers(loadedMembers);
      setProfiles((profilesResult.data ?? []) as Profile[]);
      setPolls((pollsResult.data ?? []) as Poll[]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to load tournament details.');
    }
  }, []);

  useEffect(() => {
    if (!session) return;
    loadTournaments(session);
  }, [loadTournaments, session]);

  useEffect(() => {
    if (selectedTournamentId) loadTournamentData(selectedTournamentId);
  }, [loadTournamentData, selectedTournamentId]);

  useEffect(() => {
    if (!selectedResultPoll) {
      setResultOptionId('');
      setResultPoints('1');
      return;
    }

    const options = sortedPollOptions(selectedResultPoll);
    if (!options.some((option) => option.id === resultOptionId)) {
      setResultOptionId(options[0]?.id ?? '');
    }
    setResultPoints(String(selectedResultPoll.points_per_correct || 1));
  }, [resultOptionId, selectedResultPoll]);

  useEffect(() => {
    if (!selectedEditPoll) return;

    setEditQuestion(selectedEditPoll.question);
    setEditVenue(selectedEditPoll.matches?.venue ?? '');
    setEditLocksAt(toDateTimeLocal(selectedEditPoll.locks_at));
    setEditOptions(sortedPollOptions(selectedEditPoll).map((option) => option.label));
  }, [selectedEditPoll]);

  const runAdminAction = async (action: () => Promise<void>) => {
    setBusy(true);
    setMessage('');

    try {
      await action();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Admin action failed.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setBusy(false);
    }
  };

  const handleCreateTournament = () =>
    runAdminAction(async () => {
      if (!session) throw new Error('Sign in before creating a tournament.');
      if (!tournamentName.trim()) throw new Error('Tournament name is required.');
      if (tournaments.some((tournament) => tournament.name.toLowerCase() === tournamentName.trim().toLowerCase())) {
        throw new Error(`A tournament named ${tournamentName.trim()} already exists.`);
      }

      const { data, error } = await supabase
        .from('tournaments')
        .insert({
          name: tournamentName.trim(),
          season_year: seasonYear ? Number(seasonYear) : null,
          sport: 'Cricket',
          status: 'active',
          created_by: session.user.id,
        })
        .select('*')
        .single();

      if (error) throw error;

      await loadTournaments(session);
      setSelectedTournamentId((data as Tournament).id);
      setTournamentName('');
      setSeasonYear('');
      setMessage(`${tournamentName.trim()} created. You are the tournament owner.`);
    });

  const handleCreateMatchPoll = () =>
    runAdminAction(async () => {
      if (!session || !currentTournament) throw new Error('Select a tournament first.');
      if (!teamA.trim() || !teamB.trim() || !startsAt) throw new Error('Teams and start time are required.');

      const options = normalizeOptionLabels([teamA, teamB, ...matchExtraOptions]);
      if (options.length < 2) throw new Error('At least two teams/options are required.');

      const lockTime = new Date(startsAt).toISOString();
      const question = matchQuestion.trim() || `${options[0]} vs ${options[1]}: who will win?`;
      const { data: createdMatch, error: matchError } = await supabase
        .from('matches')
        .insert({
          tournament_id: currentTournament.id,
          game_number: gameNumber ? Number(gameNumber) : null,
          team_a: options[0],
          team_b: options[1],
          starts_at: lockTime,
          venue: venue.trim() || null,
          status: 'scheduled',
          created_by: session.user.id,
        })
        .select('*')
        .single();

      if (matchError) throw matchError;

      const { data: createdPoll, error: pollError } = await supabase
        .from('polls')
        .insert({
          tournament_id: currentTournament.id,
          match_id: createdMatch.id,
          question,
          locks_at: lockTime,
          status: 'open',
          points_per_correct: 1,
          created_by: session.user.id,
        })
        .select('*')
        .single();

      if (pollError) throw pollError;

      const { error: optionError } = await supabase.from('poll_options').insert(
        options.map((label, index) => ({
          poll_id: createdPoll.id,
          label,
          sort_order: index + 1,
        })),
      );

      if (optionError) throw optionError;

      setMatchQuestion('');
      setGameNumber('');
      setTeamA('');
      setTeamB('');
      setMatchExtraOptions([]);
      setStartsAt(defaultDateTimeLocal());
      setVenue('');
      await loadTournamentData(currentTournament.id);
      setMessage('Match poll created.');
    });

  const handleCreateManualPoll = () =>
    runAdminAction(async () => {
      if (!session || !currentTournament) throw new Error('Select a tournament first.');
      const options = normalizeOptionLabels(manualOptions);
      if (!manualQuestion.trim() || options.length < 2 || !manualLocksAt) {
        throw new Error('Question, both options, and lock time are required.');
      }

      const { data: createdPoll, error } = await supabase
        .from('polls')
        .insert({
          tournament_id: currentTournament.id,
          question: manualQuestion.trim(),
          locks_at: new Date(manualLocksAt).toISOString(),
          status: 'open',
          points_per_correct: 1,
          created_by: session.user.id,
        })
        .select('*')
        .single();

      if (error) throw error;

      const { error: optionError } = await supabase.from('poll_options').insert(
        options.map((label, index) => ({
          poll_id: createdPoll.id,
          label,
          sort_order: index + 1,
        })),
      );

      if (optionError) throw optionError;

      setManualQuestion('');
      setManualOptions(['', '']);
      setManualLocksAt(defaultDateTimeLocal());
      await loadTournamentData(currentTournament.id);
      setMessage('Manual poll created.');
    });

  const handleSavePollEdits = () =>
    runAdminAction(async () => {
      if (!session || !currentTournament) throw new Error('Select a tournament first.');
      if (!selectedEditPoll) throw new Error('Select an unlocked poll to edit.');
      if (isPollLocked(selectedEditPoll)) throw new Error('This poll is already locked and cannot be edited.');

      const options = normalizeOptionLabels(editOptions);
      if (!editQuestion.trim() || options.length < 2 || !editLocksAt) {
        throw new Error('Poll question, at least two options, and lock time are required.');
      }

      const lockTime = new Date(editLocksAt).toISOString();
      const { error: pollError } = await supabase
        .from('polls')
        .update({
          question: editQuestion.trim(),
          locks_at: lockTime,
        })
        .eq('id', selectedEditPoll.id);

      if (pollError) throw pollError;

      if (selectedEditPoll.match_id) {
        const { error: matchError } = await supabase
          .from('matches')
          .update({
            team_a: options[0],
            team_b: options[1],
            starts_at: lockTime,
            venue: editVenue.trim() || null,
          })
          .eq('id', selectedEditPoll.match_id);

        if (matchError) throw matchError;
      }

      const existingOptions = sortedPollOptions(selectedEditPoll);
      for (const [index, label] of options.entries()) {
        const existingOption = existingOptions[index];
        if (existingOption) {
          const { error } = await supabase
            .from('poll_options')
            .update({ label, sort_order: index + 1 })
            .eq('id', existingOption.id);

          if (error) throw error;
        } else {
          const { error } = await supabase.from('poll_options').insert({
            poll_id: selectedEditPoll.id,
            label,
            sort_order: index + 1,
          });

          if (error) throw error;
        }
      }

      for (const extraOption of existingOptions.slice(options.length)) {
        const { error } = await supabase.from('poll_options').delete().eq('id', extraOption.id);
        if (error) throw error;
      }

      await loadTournamentData(currentTournament.id);
      setMessage('Poll details updated.');
    });

  const handleSettlePoll = () =>
    runAdminAction(async () => {
      if (!session || !currentTournament) throw new Error('Select a tournament first.');

      const poll = polls.find((item) => item.id === resultPollId);
      if (!poll) throw new Error('Select a poll to settle.');
      if (!resultOptionId) throw new Error('Select the winning option.');

      const pointsPerCorrect = Number(resultPoints);
      if (!Number.isInteger(pointsPerCorrect) || pointsPerCorrect < 1) {
        throw new Error('Points must be a whole number greater than zero.');
      }

      const now = new Date().toISOString();
      const { error: pollError } = await supabase
        .from('polls')
        .update({
          status: 'settled',
          result_option_id: resultOptionId,
          points_per_correct: pointsPerCorrect,
          settled_by: session.user.id,
          settled_at: now,
        })
        .eq('id', poll.id);

      if (pollError) throw pollError;

      if (poll.match_id) {
        const { error: matchError } = await supabase
          .from('matches')
          .update({
            status: 'completed',
            winner_team: optionLabel(poll, resultOptionId),
          })
          .eq('id', poll.match_id);

        if (matchError) throw matchError;
      }

      const { error: deleteError } = await supabase
        .from('points_ledger')
        .delete()
        .eq('poll_id', poll.id)
        .eq('reason', 'correct_pick');

      if (deleteError) throw deleteError;

      const { data: pollVotes, error: voteError } = await supabase.from('votes').select('*').eq('poll_id', poll.id);
      if (voteError) throw voteError;

      const winningVotes = (pollVotes ?? []).filter((vote) => vote.selected_option_id === resultOptionId);
      if (winningVotes.length > 0) {
        const { error: ledgerError } = await supabase.from('points_ledger').insert(
          winningVotes.map((vote) => ({
            tournament_id: currentTournament.id,
            poll_id: poll.id,
            user_id: vote.user_id,
            delta: pointsPerCorrect,
            reason: 'correct_pick',
            note: `Correct pick: ${optionLabel(poll, resultOptionId)} (${pointsPerCorrect} point${pointsPerCorrect === 1 ? '' : 's'})`,
            created_by: session.user.id,
          })),
        );

        if (ledgerError) throw ledgerError;
      }

      await supabase.from('audit_log').insert({
        tournament_id: currentTournament.id,
        actor_id: session.user.id,
        action: 'poll_settled',
        details: {
          poll_id: poll.id,
          result_option_id: resultOptionId,
          winner: optionLabel(poll, resultOptionId),
          points_per_correct: pointsPerCorrect,
          points_awarded: winningVotes.length * pointsPerCorrect,
        },
      });

      await loadTournamentData(currentTournament.id);
      setMessage(
        `Poll settled. Awarded ${winningVotes.length * pointsPerCorrect} total point${
          winningVotes.length * pointsPerCorrect === 1 ? '' : 's'
        }.`,
      );
    });

  const handleManualAdjustment = () =>
    runAdminAction(async () => {
      if (!session || !currentTournament) throw new Error('Select a tournament first.');
      if (!adjustmentUserId) throw new Error('Select a participant.');

      const delta = Number(adjustmentDelta);
      if (!Number.isFinite(delta) || delta === 0) throw new Error('Enter a non-zero point adjustment.');

      const { error } = await supabase.from('points_ledger').insert({
        tournament_id: currentTournament.id,
        user_id: adjustmentUserId,
        delta,
        reason: 'manual_adjustment',
        note: adjustmentNote.trim() || 'Manual admin adjustment',
        created_by: session.user.id,
      });

      if (error) throw error;

      setAdjustmentDelta('1');
      setAdjustmentNote('');
      setMessage('Manual point adjustment saved.');
    });

  const handlePromoteAdmin = () =>
    runAdminAction(async () => {
      if (!currentTournament || !promoteUserId) throw new Error('Select a participant to promote.');

      const { error } = await supabase
        .from('tournament_members')
        .update({ role: 'admin' })
        .eq('tournament_id', currentTournament.id)
        .eq('user_id', promoteUserId);

      if (error) throw error;

      await loadTournamentData(currentTournament.id);
      setMessage('Participant promoted to co-admin.');
    });

  if (!isSupabaseConfigured) {
    return (
      <main className="min-h-screen bg-slate-50 p-6">
        <div className="mx-auto max-w-xl rounded-lg border border-amber-200 bg-amber-50 p-6 text-amber-950">
          <h1 className="text-xl font-bold">Supabase environment is missing</h1>
          <p className="mt-2 text-sm">Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY before using admin tools.</p>
        </div>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="min-h-screen bg-slate-50 p-6">
        <div className="mx-auto max-w-xl rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-bold">Admin sign-in required</h1>
          <p className="mt-2 text-slate-600">Sign in before creating tournaments or managing polls.</p>
          <a
            href="/login"
            className="mt-4 inline-flex h-10 items-center rounded-md bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700"
          >
            Sign in
          </a>
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
            {tournaments.length > 0 && (
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
            <button
              onClick={() => currentTournament && loadTournamentData(currentTournament.id)}
              className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 px-3 text-sm font-semibold hover:bg-slate-100"
            >
              <RefreshCcw size={16} />
              Refresh
            </button>
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-7xl px-4 py-6">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-xs font-bold uppercase text-red-600">
              <ShieldAlert size={16} />
              Admin Console
            </p>
            <h1 className="mt-1 text-3xl font-black">Tournament operations</h1>
            <p className="mt-2 text-sm text-slate-600">
              Signed in as {profile?.display_name ?? session.user.email}. Create tournaments, manage polls, settle results, and adjust points.
            </p>
          </div>
          <a
            href="/"
            className="inline-flex h-10 items-center rounded-md border border-slate-300 px-3 text-sm font-semibold hover:bg-slate-100"
          >
            Back to dashboard
          </a>
        </header>

        {message && (
          <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-950">
            {message}
          </div>
        )}

        <section className="mb-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="flex items-center gap-2 font-bold">
            <Plus size={18} />
            Create Tournament
          </h2>
          <div className="mt-4 grid gap-3 md:grid-cols-[1fr_160px_auto] md:items-end">
            <label className="block">
              <span className="text-sm font-semibold text-slate-700">Tournament name</span>
              <input
                value={tournamentName}
                onChange={(event) => setTournamentName(event.target.value)}
                className="mt-1 h-11 w-full rounded-md border border-slate-300 px-3 outline-none focus:border-blue-500"
                placeholder="IPL 2027"
              />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-slate-700">Season year</span>
              <input
                value={seasonYear}
                onChange={(event) => setSeasonYear(event.target.value)}
                className="mt-1 h-11 w-full rounded-md border border-slate-300 px-3 outline-none focus:border-blue-500"
                placeholder="2027"
                type="number"
              />
            </label>
            <button
              disabled={busy}
              onClick={handleCreateTournament}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Save size={16} />
              Create
            </button>
          </div>
        </section>

        {currentTournament && !canAdmin ? (
          <section className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-amber-950">
            <h2 className="font-bold">You are not an admin for {currentTournament.name}</h2>
            <p className="mt-2 text-sm">Ask the tournament owner to promote your account to co-admin.</p>
          </section>
        ) : currentTournament ? (
          <div className="grid gap-6 lg:grid-cols-2">
            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="flex items-center gap-2 font-bold">
                <Settings size={18} />
                Create Match Poll
              </h2>
              <div className="mt-4 grid gap-3">
                <label className="block">
                  <span className="text-sm font-semibold text-slate-700">Poll question</span>
                  <input
                    value={matchQuestion}
                    onChange={(event) => setMatchQuestion(event.target.value)}
                    className="mt-1 h-11 w-full rounded-md border border-slate-300 px-3 outline-none focus:border-blue-500"
                    placeholder="Who will win QF1?"
                  />
                </label>
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="block">
                    <span className="text-sm font-semibold text-slate-700">Game number</span>
                    <input
                      value={gameNumber}
                      onChange={(event) => setGameNumber(event.target.value)}
                      className="mt-1 h-11 w-full rounded-md border border-slate-300 px-3 outline-none focus:border-blue-500"
                      placeholder="1"
                      type="number"
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-semibold text-slate-700">Team A</span>
                    <input
                      value={teamA}
                      onChange={(event) => setTeamA(event.target.value)}
                      className="mt-1 h-11 w-full rounded-md border border-slate-300 px-3 outline-none focus:border-blue-500"
                      placeholder="RCB"
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-semibold text-slate-700">Team B</span>
                    <input
                      value={teamB}
                      onChange={(event) => setTeamB(event.target.value)}
                      className="mt-1 h-11 w-full rounded-md border border-slate-300 px-3 outline-none focus:border-blue-500"
                      placeholder="GT"
                    />
                  </label>
                </div>
                {matchExtraOptions.map((option, index) => (
                  <label className="block" key={`match-extra-${index}`}>
                    <span className="text-sm font-semibold text-slate-700">Additional team/option {index + 1}</span>
                    <div className="mt-1 grid gap-2 sm:grid-cols-[1fr_auto]">
                      <input
                        value={option}
                        onChange={(event) =>
                          setMatchExtraOptions((current) =>
                            current.map((item, itemIndex) => (itemIndex === index ? event.target.value : item)),
                          )
                        }
                        className="h-11 w-full rounded-md border border-slate-300 px-3 outline-none focus:border-blue-500"
                        placeholder="CSK"
                      />
                      <button
                        onClick={() => setMatchExtraOptions((current) => current.filter((_item, itemIndex) => itemIndex !== index))}
                        className="h-11 rounded-md border border-slate-300 px-3 text-sm font-semibold hover:bg-slate-100"
                      >
                        Remove
                      </button>
                    </div>
                  </label>
                ))}
                <button
                  onClick={() => setMatchExtraOptions((current) => [...current, ''])}
                  className="inline-flex h-10 items-center justify-center rounded-md border border-slate-300 px-3 text-sm font-bold hover:bg-slate-50"
                >
                  Add another team/option
                </button>
                <label className="block">
                  <span className="text-sm font-semibold text-slate-700">Match start / poll lock time</span>
                  <input
                    value={startsAt}
                    onChange={(event) => setStartsAt(event.target.value)}
                    className="mt-1 h-11 w-full rounded-md border border-slate-300 px-3 outline-none focus:border-blue-500"
                    type="datetime-local"
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-semibold text-slate-700">Venue</span>
                  <input
                    value={venue}
                    onChange={(event) => setVenue(event.target.value)}
                    className="mt-1 h-11 w-full rounded-md border border-slate-300 px-3 outline-none focus:border-blue-500"
                    placeholder="Dharamsala"
                  />
                </label>
                <button
                  disabled={busy}
                  onClick={handleCreateMatchPoll}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-slate-900 px-4 text-sm font-bold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Plus size={16} />
                  Create match poll
                </button>
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="flex items-center gap-2 font-bold">
                <Plus size={18} />
                Create Manual Poll
              </h2>
              <div className="mt-4 grid gap-3">
                <label className="block">
                  <span className="text-sm font-semibold text-slate-700">Poll question</span>
                  <input
                    value={manualQuestion}
                    onChange={(event) => setManualQuestion(event.target.value)}
                    className="mt-1 h-11 w-full rounded-md border border-slate-300 px-3 outline-none focus:border-blue-500"
                    placeholder="Who will win the toss?"
                  />
                </label>
                <div className="grid gap-3">
                  {manualOptions.map((option, index) => (
                    <label className="block" key={`manual-option-${index}`}>
                      <span className="text-sm font-semibold text-slate-700">
                        {index === 0 ? 'Option A' : index === 1 ? 'Option B' : `Additional option ${index - 1}`}
                      </span>
                      <div className="mt-1 grid gap-2 sm:grid-cols-[1fr_auto]">
                        <input
                          value={option}
                          onChange={(event) =>
                            setManualOptions((current) =>
                              current.map((item, itemIndex) => (itemIndex === index ? event.target.value : item)),
                            )
                          }
                          className="h-11 w-full rounded-md border border-slate-300 px-3 outline-none focus:border-blue-500"
                          placeholder={index === 0 ? 'Option A' : index === 1 ? 'Option B' : 'Additional option'}
                        />
                        {index > 1 && (
                          <button
                            onClick={() => setManualOptions((current) => current.filter((_item, itemIndex) => itemIndex !== index))}
                            className="h-11 rounded-md border border-slate-300 px-3 text-sm font-semibold hover:bg-slate-100"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </label>
                  ))}
                  <button
                    onClick={() => setManualOptions((current) => [...current, ''])}
                    className="inline-flex h-10 items-center justify-center rounded-md border border-slate-300 px-3 text-sm font-bold hover:bg-slate-50"
                  >
                    Add another option
                  </button>
                </div>
                <label className="block">
                  <span className="text-sm font-semibold text-slate-700">Poll lock time</span>
                  <input
                    value={manualLocksAt}
                    onChange={(event) => setManualLocksAt(event.target.value)}
                    className="mt-1 h-11 w-full rounded-md border border-slate-300 px-3 outline-none focus:border-blue-500"
                    type="datetime-local"
                  />
                </label>
                <button
                  disabled={busy}
                  onClick={handleCreateManualPoll}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-slate-900 px-4 text-sm font-bold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Plus size={16} />
                  Create manual poll
                </button>
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
              <h2 className="flex items-center gap-2 font-bold">
                <Settings size={18} />
                Edit Unlocked Poll Details
              </h2>
              <div className="mt-4 grid gap-3">
                <select
                  value={editPollId}
                  onChange={(event) => setEditPollId(event.target.value)}
                  className="h-11 rounded-md border border-slate-300 bg-white px-3 outline-none focus:border-blue-500"
                >
                  <option value="">Select open poll</option>
                  {editablePolls.map((poll) => (
                    <option key={poll.id} value={poll.id}>
                      {poll.question} - locks {formatDateTime(poll.locks_at)}
                    </option>
                  ))}
                </select>

                {selectedEditPoll && (
                  <>
                    <label className="block">
                      <span className="text-sm font-semibold text-slate-700">Poll question</span>
                      <input
                        value={editQuestion}
                        onChange={(event) => setEditQuestion(event.target.value)}
                        className="mt-1 h-11 w-full rounded-md border border-slate-300 px-3 outline-none focus:border-blue-500"
                      />
                    </label>
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="block">
                        <span className="text-sm font-semibold text-slate-700">Poll lock time</span>
                        <input
                          value={editLocksAt}
                          onChange={(event) => setEditLocksAt(event.target.value)}
                          className="mt-1 h-11 w-full rounded-md border border-slate-300 px-3 outline-none focus:border-blue-500"
                          type="datetime-local"
                        />
                      </label>
                      <label className="block">
                        <span className="text-sm font-semibold text-slate-700">Venue</span>
                        <input
                          value={editVenue}
                          onChange={(event) => setEditVenue(event.target.value)}
                          className="mt-1 h-11 w-full rounded-md border border-slate-300 px-3 outline-none focus:border-blue-500"
                          disabled={!selectedEditPoll.match_id}
                          placeholder={selectedEditPoll.match_id ? 'Venue' : 'Manual polls do not have venues'}
                        />
                      </label>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      {editOptions.map((option, index) => (
                        <label className="block" key={`edit-option-${index}`}>
                          <span className="text-sm font-semibold text-slate-700">Option {index + 1}</span>
                          <div className="mt-1 grid gap-2 sm:grid-cols-[1fr_auto]">
                            <input
                              value={option}
                              onChange={(event) =>
                                setEditOptions((current) =>
                                  current.map((item, itemIndex) => (itemIndex === index ? event.target.value : item)),
                                )
                              }
                              className="h-11 w-full rounded-md border border-slate-300 px-3 outline-none focus:border-blue-500"
                            />
                            {index > 1 && (
                              <button
                                onClick={() => setEditOptions((current) => current.filter((_item, itemIndex) => itemIndex !== index))}
                                className="h-11 rounded-md border border-slate-300 px-3 text-sm font-semibold hover:bg-slate-100"
                              >
                                Remove
                              </button>
                            )}
                          </div>
                        </label>
                      ))}
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <button
                        onClick={() => setEditOptions((current) => [...current, ''])}
                        className="inline-flex h-10 items-center justify-center rounded-md border border-slate-300 px-3 text-sm font-bold hover:bg-slate-50"
                      >
                        Add another option
                      </button>
                      <button
                        disabled={busy}
                        onClick={handleSavePollEdits}
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-blue-600 px-3 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <Save size={16} />
                        Save corrections
                      </button>
                    </div>
                  </>
                )}
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="flex items-center gap-2 font-bold">
                <CheckCircle2 size={18} />
                End Poll and Calculate Points
              </h2>
              <div className="mt-4 grid gap-3">
                <select
                  value={resultPollId}
                  onChange={(event) => setResultPollId(event.target.value)}
                  className="h-11 rounded-md border border-slate-300 bg-white px-3 outline-none focus:border-blue-500"
                >
                  <option value="">Select poll</option>
                  {polls
                    .filter((poll) => poll.status !== 'settled' && poll.status !== 'cancelled')
                    .map((poll) => (
                      <option key={poll.id} value={poll.id}>
                        {poll.question} - locks {formatDateTime(poll.locks_at)}
                      </option>
                    ))}
                </select>
                <select
                  value={resultOptionId}
                  onChange={(event) => setResultOptionId(event.target.value)}
                  className="h-11 rounded-md border border-slate-300 bg-white px-3 outline-none focus:border-blue-500"
                >
                  <option value="">Select winning option</option>
                  {selectedResultOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <label className="block">
                  <span className="text-sm font-semibold text-slate-700">Points per correct vote</span>
                  <input
                    value={resultPoints}
                    onChange={(event) => setResultPoints(event.target.value)}
                    className="mt-1 h-11 w-full rounded-md border border-slate-300 px-3 outline-none focus:border-blue-500"
                    min={1}
                    type="number"
                  />
                </label>
                <button
                  disabled={busy}
                  onClick={handleSettlePoll}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-green-600 px-4 text-sm font-bold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <CheckCircle2 size={16} />
                  Set result and award points
                </button>
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="flex items-center gap-2 font-bold">
                <Crown size={18} />
                Co-admins and Point Adjustments
              </h2>
              <div className="mt-4 grid gap-3">
                <select
                  value={promoteUserId}
                  onChange={(event) => setPromoteUserId(event.target.value)}
                  className="h-11 rounded-md border border-slate-300 bg-white px-3 outline-none focus:border-blue-500"
                >
                  <option value="">Select participant to promote</option>
                  {members
                    .filter((member) => member.status === 'active' && member.role === 'participant')
                    .map((member) => (
                      <option key={member.id} value={member.user_id}>
                        {profileById.get(member.user_id)?.display_name ?? member.user_id}
                      </option>
                    ))}
                </select>
                <button
                  disabled={busy}
                  onClick={handlePromoteAdmin}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-slate-300 px-4 text-sm font-bold hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Crown size={16} />
                  Make co-admin
                </button>

                <div className="mt-3 border-t border-slate-200 pt-4">
                  <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
                    <select
                      value={adjustmentUserId}
                      onChange={(event) => setAdjustmentUserId(event.target.value)}
                      className="h-11 rounded-md border border-slate-300 bg-white px-3 outline-none focus:border-blue-500"
                    >
                      <option value="">Select participant</option>
                      {members
                        .filter((member) => member.status === 'active')
                        .map((member) => (
                          <option key={member.id} value={member.user_id}>
                            {profileById.get(member.user_id)?.display_name ?? member.user_id}
                          </option>
                        ))}
                    </select>
                    <input
                      value={adjustmentDelta}
                      onChange={(event) => setAdjustmentDelta(event.target.value)}
                      className="h-11 rounded-md border border-slate-300 px-3 outline-none focus:border-blue-500"
                      type="number"
                      placeholder="+/- points"
                    />
                  </div>
                  <input
                    value={adjustmentNote}
                    onChange={(event) => setAdjustmentNote(event.target.value)}
                    className="mt-3 h-11 w-full rounded-md border border-slate-300 px-3 outline-none focus:border-blue-500"
                    placeholder="Reason for adjustment"
                  />
                  <button
                    disabled={busy}
                    onClick={handleManualAdjustment}
                    className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-red-600 px-4 text-sm font-bold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Save size={16} />
                    Save point adjustment
                  </button>
                </div>
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
              <h2 className="flex items-center gap-2 font-bold">
                <Users size={18} />
                Members
              </h2>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Name</th>
                      <th className="px-4 py-3">Role</th>
                      <th className="px-4 py-3">Joined</th>
                      <th className="px-4 py-3">Reminder</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {members.map((member) => {
                      const memberProfile = profileById.get(member.user_id);

                      return (
                        <tr key={member.id}>
                          <td className="px-4 py-3 font-semibold">{memberProfile?.display_name ?? member.user_id}</td>
                          <td className="px-4 py-3 capitalize">{member.role}</td>
                          <td className="px-4 py-3">{formatDateTime(member.joined_at)}</td>
                          <td className="px-4 py-3 capitalize">{memberProfile?.notification_channel ?? 'email'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        ) : (
          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="font-bold">No tournament selected</h2>
            <p className="mt-2 text-sm text-slate-600">Create IPL 2026 above to begin.</p>
          </section>
        )}
      </main>
    </div>
  );
}
