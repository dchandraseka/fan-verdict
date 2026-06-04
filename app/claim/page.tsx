"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { ArrowLeft, CheckCircle2, Clock, Send, Trophy, UserCheck } from 'lucide-react';
import { ensureProfile } from '@/lib/account';
import { getErrorMessage } from '@/lib/errors';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import type { HistoricalClaimRequest, HistoricalParticipant, HistoricalStanding, Profile } from '@/lib/types';

export default function ClaimProfilePage() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [participants, setParticipants] = useState<HistoricalParticipant[]>([]);
  const [standings, setStandings] = useState<HistoricalStanding[]>([]);
  const [requests, setRequests] = useState<HistoricalClaimRequest[]>([]);
  const [message, setMessage] = useState('');
  const [busyParticipantId, setBusyParticipantId] = useState('');

  const standingsByParticipant = useMemo(() => {
    const summary = new Map<string, { seasons: number; points: number; correct: number; missed: number }>();
    for (const row of standings) {
      const current = summary.get(row.historical_participant_id) ?? { seasons: 0, points: 0, correct: 0, missed: 0 };
      current.seasons += 1;
      current.points += row.total_points;
      current.correct += row.correct_picks;
      current.missed += row.missed_events;
      summary.set(row.historical_participant_id, current);
    }
    return summary;
  }, [standings]);

  const requestByParticipant = useMemo(() => {
    const pending = new Map<string, HistoricalClaimRequest>();
    for (const request of requests) {
      if (request.status === 'pending') pending.set(request.historical_participant_id, request);
    }
    return pending;
  }, [requests]);

  const myClaimedParticipant = useMemo(
    () => participants.find((participant) => participant.claimed_profile_id === session?.user.id) ?? null,
    [participants, session?.user.id],
  );

  const loadClaimData = useCallback(async (activeSession: Session) => {
    setMessage('');

    try {
      const [loadedProfile, participantsResult, standingsResult, requestsResult] = await Promise.all([
        ensureProfile(activeSession),
        supabase.from('historical_participants').select('*').order('display_name', { ascending: true }),
        supabase.from('historical_standings').select('*'),
        supabase
          .from('historical_claim_requests')
          .select('*')
          .eq('requester_profile_id', activeSession.user.id)
          .order('created_at', { ascending: false }),
      ]);

      if (participantsResult.error) throw participantsResult.error;
      if (standingsResult.error) throw standingsResult.error;
      if (requestsResult.error) throw requestsResult.error;

      setProfile(loadedProfile);
      setParticipants((participantsResult.data ?? []) as HistoricalParticipant[]);
      setStandings((standingsResult.data ?? []) as HistoricalStanding[]);
      setRequests((requestsResult.data ?? []) as HistoricalClaimRequest[]);
    } catch (error) {
      setMessage(getErrorMessage(error, 'Unable to load claim profile data.'));
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session) loadClaimData(data.session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (nextSession) loadClaimData(nextSession);
    });

    return () => subscription.unsubscribe();
  }, [loadClaimData]);

  const handleRequestClaim = async (participant: HistoricalParticipant) => {
    if (!session) return;

    setBusyParticipantId(participant.id);
    setMessage('');

    try {
      const { error } = await supabase.rpc('request_historical_claim', {
        target_historical_participant_id: participant.id,
      });

      if (error) throw error;

      await loadClaimData(session);
      setMessage(`Claim request submitted for ${participant.display_name}. An admin will review it.`);
    } catch (error) {
      setMessage(getErrorMessage(error, 'Unable to request this profile claim.'));
    } finally {
      setBusyParticipantId('');
    }
  };

  if (!isSupabaseConfigured) {
    return (
      <main className="min-h-screen bg-slate-50 p-6">
        <div className="mx-auto max-w-xl rounded-lg border border-amber-200 bg-amber-50 p-6 text-amber-950">
          <h1 className="text-xl font-bold">Supabase environment is missing</h1>
          <p className="mt-2 text-sm">Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY before claiming a profile.</p>
        </div>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="min-h-screen bg-slate-50 p-6">
        <div className="mx-auto max-w-xl rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-bold">Sign in required</h1>
          <p className="mt-2 text-slate-600">Sign in before claiming your historical FanVerdict profile.</p>
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
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <a href="/" className="flex items-center gap-2 text-lg font-bold">
            <Trophy className="text-blue-600" size={24} />
            FanVerdict
          </a>
          <a
            href="/"
            className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 px-3 text-sm font-semibold hover:bg-slate-100"
          >
            <ArrowLeft size={16} />
            Dashboard
          </a>
        </div>
      </nav>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <header className="mb-6">
          <p className="flex items-center gap-2 text-xs font-bold uppercase text-blue-600">
            <UserCheck size={16} />
            Claim Profile
          </p>
          <h1 className="mt-1 text-3xl font-black">Link your historical standings</h1>
          <p className="mt-2 text-sm text-slate-600">
            Signed in as {profile?.display_name ?? session.user.email}. Select your historical participant name and an admin will review it.
          </p>
        </header>

        {message && (
          <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-950">
            {message}
          </div>
        )}

        {myClaimedParticipant && (
          <section className="mb-6 rounded-lg border border-green-200 bg-green-50 p-5 text-green-900">
            <h2 className="flex items-center gap-2 font-bold">
              <CheckCircle2 size={18} />
              Historical profile linked
            </h2>
            <p className="mt-2 text-sm">
              Your account is linked to {myClaimedParticipant.display_name}. This claim will be highlighted on historical standings.
            </p>
          </section>
        )}

        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="font-bold">Available historical profiles</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-5 py-3">Participant</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Seasons</th>
                  <th className="px-5 py-3">Points</th>
                  <th className="px-5 py-3">Correct</th>
                  <th className="px-5 py-3">Missed</th>
                  <th className="px-5 py-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {participants.map((participant) => {
                  const summary = standingsByParticipant.get(participant.id);
                  const pendingRequest = requestByParticipant.get(participant.id);
                  const claimedByMe = participant.claimed_profile_id === session.user.id;
                  const claimed = Boolean(participant.claimed_profile_id);
                  const blocked = participant.claim_status === 'blocked';
                  const disabled =
                    Boolean(myClaimedParticipant) || claimed || blocked || Boolean(pendingRequest) || Boolean(busyParticipantId);

                  return (
                    <tr key={participant.id} className={claimedByMe ? 'bg-blue-50/50' : undefined}>
                      <td className="px-5 py-3 font-semibold">{participant.display_name}</td>
                      <td className="px-5 py-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold uppercase ${
                            claimedByMe
                              ? 'bg-blue-100 text-blue-700'
                              : claimed
                                ? 'bg-green-100 text-green-700'
                                : blocked
                                  ? 'bg-red-100 text-red-700'
                                : pendingRequest
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {claimedByMe ? 'Your profile' : claimed ? 'Claimed' : blocked ? 'Blocked' : pendingRequest ? 'Pending' : 'Unclaimed'}
                        </span>
                      </td>
                      <td className="px-5 py-3">{summary?.seasons ?? 0}</td>
                      <td className="px-5 py-3 font-bold text-blue-700">{summary?.points ?? 0}</td>
                      <td className="px-5 py-3">{summary?.correct ?? 0}</td>
                      <td className="px-5 py-3">{summary?.missed ?? 0}</td>
                      <td className="px-5 py-3">
                        {pendingRequest ? (
                          <span className="inline-flex items-center gap-2 text-xs font-semibold text-amber-700">
                            <Clock size={14} />
                            Awaiting admin
                          </span>
                        ) : (
                          <button
                            disabled={disabled}
                            onClick={() => handleRequestClaim(participant)}
                            className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 px-3 text-xs font-bold hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <Send size={14} />
                            Request claim
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
