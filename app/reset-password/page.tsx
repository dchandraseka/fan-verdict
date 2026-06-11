"use client";

import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, KeyRound, Trophy } from 'lucide-react';
import type { Session } from '@supabase/supabase-js';
import { getErrorMessage } from '@/lib/errors';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

type ResetState = 'checking' | 'ready' | 'invalid' | 'updated';

export default function ResetPasswordPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [resetState, setResetState] = useState<ResetState>('checking');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setResetState('invalid');
      return;
    }

    let active = true;

    const clearRecoveryUrl = () => {
      window.history.replaceState({}, document.title, window.location.pathname);
    };

    const loadRecoverySession = async () => {
      try {
        const url = new URL(window.location.href);
        const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
        const code = url.searchParams.get('code');
        const accessToken = hashParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token');

        if (code) {
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;

          if (!active) return;

          setSession(data.session);
          setResetState(data.session ? 'ready' : 'invalid');
          clearRecoveryUrl();
          return;
        }

        if (accessToken && refreshToken) {
          const { data, error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) throw error;

          if (!active) return;

          setSession(data.session);
          setResetState(data.session ? 'ready' : 'invalid');
          clearRecoveryUrl();
          return;
        }

        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;

        if (!active) return;

        setSession(data.session);
        setResetState(data.session ? 'ready' : 'invalid');
        if (!data.session) {
          setMessage('Open the password reset link from your email to continue.');
        }
      } catch (error) {
        if (!active) return;

        setSession(null);
        setResetState('invalid');
        setMessage(getErrorMessage(error, 'Password reset link is invalid or has expired.'));
      }
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return;

      setSession(nextSession);
      if (event === 'PASSWORD_RECOVERY' && nextSession) {
        setResetState('ready');
        setMessage('');
        clearRecoveryUrl();
      }
    });

    loadRecoverySession();

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const updatePassword = async () => {
    if (!session) {
      setMessage('Open the password reset link from your email before setting a new password.');
      setResetState('invalid');
      return;
    }

    if (newPassword.length < 6) {
      setMessage('Password must be at least 6 characters.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setMessage('Passwords do not match.');
      return;
    }

    setBusy(true);
    setMessage('');

    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;

      setNewPassword('');
      setConfirmPassword('');
      setResetState('updated');
      setMessage('Password updated. You can now continue to FanVerdict.');
    } catch (error) {
      setMessage(getErrorMessage(error, 'Unable to update password.'));
    } finally {
      setBusy(false);
    }
  };

  const canUpdate = !busy && resetState === 'ready' && newPassword.length >= 6 && confirmPassword.length >= 6;

  if (!isSupabaseConfigured) {
    return (
      <main className="min-h-screen bg-slate-50 p-6">
        <div className="mx-auto max-w-xl rounded-lg border border-amber-200 bg-amber-50 p-6 text-amber-950">
          <h1 className="text-xl font-bold">Supabase environment is missing</h1>
          <p className="mt-2 text-sm">Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY before resetting passwords.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-[1fr_420px] md:items-center">
        <section>
          <a href="/" className="inline-flex items-center gap-2 font-bold text-slate-950">
            <Trophy className="text-blue-600" size={26} />
            FanVerdict
          </a>
          <h1 className="mt-8 max-w-2xl text-4xl font-black tracking-normal text-slate-950">
            Set a new password and get back to your picks.
          </h1>
          <p className="mt-4 max-w-xl text-slate-600">
            Use the recovery link from your email to secure your account and return to the tournament dashboard.
          </p>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2">
            <KeyRound className="text-blue-600" size={22} />
            <h2 className="text-xl font-black">Reset password</h2>
          </div>

          {resetState === 'checking' ? (
            <p className="mt-6 rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-950">Checking reset link...</p>
          ) : (
            <div className="mt-6 space-y-4">
              {resetState === 'invalid' && (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                  {message || 'Password reset link is invalid or has expired.'}
                </div>
              )}

              {resetState !== 'invalid' && (
                <>
                  <label className="block">
                    <span className="text-sm font-semibold text-slate-700">New password</span>
                    <input
                      type="password"
                      value={newPassword}
                      disabled={resetState === 'updated'}
                      onChange={(event) => setNewPassword(event.target.value)}
                      className="mt-1 h-11 w-full rounded-md border border-slate-300 px-3 outline-none focus:border-blue-500 disabled:bg-slate-100"
                      placeholder="At least 6 characters"
                    />
                    {newPassword && newPassword.length < 6 && (
                      <span className="mt-1 block text-xs font-semibold text-red-600">Password must be at least 6 characters.</span>
                    )}
                  </label>

                  <label className="block">
                    <span className="text-sm font-semibold text-slate-700">Confirm new password</span>
                    <input
                      type="password"
                      value={confirmPassword}
                      disabled={resetState === 'updated'}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      className="mt-1 h-11 w-full rounded-md border border-slate-300 px-3 outline-none focus:border-blue-500 disabled:bg-slate-100"
                      placeholder="Re-enter password"
                    />
                    {confirmPassword && newPassword !== confirmPassword && (
                      <span className="mt-1 block text-xs font-semibold text-red-600">Passwords do not match.</span>
                    )}
                  </label>
                </>
              )}

              {message && resetState !== 'invalid' && (
                <p className="rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-950">{message}</p>
              )}

              {resetState === 'ready' && (
                <button
                  disabled={!canUpdate}
                  onClick={updatePassword}
                  className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Update password
                  <ArrowRight size={18} />
                </button>
              )}

              {resetState === 'updated' ? (
                <a
                  href="/"
                  className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700"
                >
                  Continue to dashboard
                  <ArrowRight size={18} />
                </a>
              ) : (
                <a
                  href="/login"
                  className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md border border-slate-300 px-4 text-sm font-semibold text-slate-800 hover:bg-slate-100"
                >
                  <ArrowLeft size={16} />
                  Back to sign in
                </a>
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
