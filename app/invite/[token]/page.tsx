"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { ArrowRight, CheckCircle2, Loader2, LogIn, Trophy } from 'lucide-react';
import { getErrorMessage } from '@/lib/errors';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

type InviteResponse = {
  ok?: boolean;
  alreadyAccepted?: boolean;
  error?: string;
  league?: {
    id: string;
    name: string;
    tournament_id: string;
  } | null;
  tournament?: {
    id: string;
    name: string;
  } | null;
};

type InvitePageProps = {
  params: {
    token: string;
  };
};

type InviteState = 'checking' | 'needs-auth' | 'accepting' | 'accepted' | 'error';

export default function InvitePage({ params }: InvitePageProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [state, setState] = useState<InviteState>('checking');
  const [message, setMessage] = useState('');
  const [inviteResult, setInviteResult] = useState<InviteResponse | null>(null);
  const [attemptedAccept, setAttemptedAccept] = useState(false);

  const redirectPath = useMemo(() => `/invite/${encodeURIComponent(params.token)}`, [params.token]);
  const signInUrl = `/login?redirect=${encodeURIComponent(redirectPath)}`;
  const signUpUrl = `/login?mode=sign-up&redirect=${encodeURIComponent(redirectPath)}`;
  const dashboardUrl =
    inviteResult?.league && inviteResult?.tournament
      ? `/?tournament=${encodeURIComponent(inviteResult.tournament.id)}&privateLeague=${encodeURIComponent(inviteResult.league.id)}#private-leagues`
      : '/';

  const acceptInvite = useCallback(
    async (activeSession: Session) => {
      setState('accepting');
      setMessage('');

      try {
        const response = await fetch('/api/private-league-email-invites/accept', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${activeSession.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ token: params.token }),
        });
        const payload = (await response.json().catch(() => ({}))) as InviteResponse;

        if (!response.ok) {
          throw new Error(payload.error || 'Unable to accept this invite.');
        }

        setInviteResult(payload);
        setState('accepted');
        setMessage(payload.alreadyAccepted ? 'This invite was already accepted.' : 'Invite accepted.');
      } catch (error) {
        setState('error');
        setMessage(getErrorMessage(error, 'Unable to accept this invite.'));
      }
    },
    [params.token],
  );

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (!data.session) {
        setAttemptedAccept(false);
        setState('needs-auth');
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (!nextSession) {
        setAttemptedAccept(false);
        setState('needs-auth');
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session || attemptedAccept || state === 'accepted') return;

    setAttemptedAccept(true);
    acceptInvite(session);
  }, [acceptInvite, attemptedAccept, session, state]);

  if (!isSupabaseConfigured) {
    return (
      <main className="min-h-screen bg-slate-50 p-6">
        <div className="mx-auto max-w-xl rounded-lg border border-amber-200 bg-amber-50 p-6 text-amber-950">
          <h1 className="text-xl font-bold">Supabase environment is missing</h1>
          <p className="mt-2 text-sm">Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY before accepting invites.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-950">
      <div className="mx-auto max-w-2xl">
        <a href="/" className="inline-flex items-center gap-2 font-bold">
          <Trophy className="text-blue-600" size={26} />
          FanVerdict
        </a>

        <section className="mt-8 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-start gap-3">
            {state === 'accepted' ? (
              <CheckCircle2 className="mt-1 text-green-600" size={24} />
            ) : state === 'accepting' || state === 'checking' ? (
              <Loader2 className="mt-1 animate-spin text-blue-600" size={24} />
            ) : (
              <LogIn className="mt-1 text-blue-600" size={24} />
            )}
            <div>
              <p className="text-xs font-bold uppercase text-blue-600">Private League Invite</p>
              <h1 className="mt-1 text-2xl font-black">
                {state === 'accepted'
                  ? `You joined ${inviteResult?.league?.name ?? 'the private league'}`
                  : state === 'needs-auth'
                    ? 'Sign in to accept your invite'
                    : state === 'error'
                      ? 'Invite needs attention'
                      : 'Accepting invite'}
              </h1>
              <p className="mt-2 text-sm text-slate-600">
                {state === 'needs-auth'
                  ? 'Use the email address that received the invite. After sign-in or signup, FanVerdict will add you to the tournament and private league.'
                  : state === 'accepted'
                    ? `You are enrolled in ${inviteResult?.tournament?.name ?? 'the tournament'} and this private league.`
                    : state === 'error'
                      ? message
                      : 'Checking your account and invite token.'}
              </p>
            </div>
          </div>

          {message && state !== 'error' && (
            <p className="mt-5 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-950">{message}</p>
          )}

          {state === 'needs-auth' && (
            <div className="mt-6 grid gap-2 sm:grid-cols-2">
              <a
                href={signInUrl}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700"
              >
                Sign in
                <ArrowRight size={18} />
              </a>
              <a
                href={signUpUrl}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-slate-300 px-4 text-sm font-bold text-slate-700 hover:bg-slate-50"
              >
                Create account
              </a>
            </div>
          )}

          {state === 'error' && (
            <div className="mt-6 flex flex-wrap gap-2">
              {session && (
                <button
                  onClick={() => acceptInvite(session)}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700"
                >
                  Try again
                </button>
              )}
              <button
                onClick={async () => {
                  await supabase.auth.signOut();
                  window.location.href = signInUrl;
                }}
                className="inline-flex h-10 items-center justify-center rounded-md border border-slate-300 px-4 text-sm font-bold text-slate-700 hover:bg-slate-50"
              >
                Sign in with another account
              </button>
            </div>
          )}

          {state === 'accepted' && (
            <a
              href={dashboardUrl}
              className="mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-md bg-slate-900 px-4 text-sm font-bold text-white hover:bg-slate-800"
            >
              Open tournament
              <ArrowRight size={18} />
            </a>
          )}
        </section>
      </div>
    </main>
  );
}
