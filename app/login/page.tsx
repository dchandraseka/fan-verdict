"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Mail, Trophy } from 'lucide-react';
import { getErrorMessage } from '@/lib/errors';
import { validateOptionalInternationalPhone } from '@/lib/phone';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import type { NotificationChannel } from '@/lib/types';

type AuthMode = 'sign-in' | 'sign-up';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>('sign-in');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [notificationChannel, setNotificationChannel] = useState<NotificationChannel>('email');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const handleEmailAuth = async () => {
    setBusy(true);
    setMessage('');

    try {
      if (mode === 'sign-up') {
        const phoneValidation = validateOptionalInternationalPhone(whatsappNumber);
        if (!phoneValidation.ok) {
          setMessage(phoneValidation.message ?? 'Invalid phone number.');
          return;
        }

        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/login`,
            data: {
              display_name: displayName.trim() || email.split('@')[0],
              whatsapp_number: phoneValidation.value,
              notification_channel: notificationChannel,
            },
          },
        });

        if (error) throw error;

        if (data.session) {
          router.push('/');
          return;
        }

        setMessage('Account created. Check your email if confirmation is enabled in Supabase.');
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) throw error;
      router.push('/');
    } catch (error) {
      setMessage(getErrorMessage(error, 'Authentication failed.'));
    } finally {
      setBusy(false);
    }
  };

  const handleOAuth = async (provider: 'google' | 'facebook') => {
    setBusy(true);
    setMessage('');

    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/`,
      },
    });

    if (error) {
      setMessage(error.message);
      setBusy(false);
    }
  };

  if (!isSupabaseConfigured) {
    return (
      <main className="min-h-screen bg-slate-50 p-6">
        <div className="mx-auto max-w-xl rounded-lg border border-amber-200 bg-amber-50 p-6 text-amber-950">
          <h1 className="text-xl font-bold">Supabase environment is missing</h1>
          <p className="mt-2 text-sm">Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY before signing in.</p>
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
            One account for every tournament, vote, reminder, and leaderboard.
          </h1>
          <p className="mt-4 max-w-xl text-slate-600">
            Sign in to join your group, cast match predictions, and keep a timestamped record of every vote.
          </p>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div className="grid grid-cols-2 rounded-md bg-slate-100 p-1">
            <button
              onClick={() => setMode('sign-in')}
              className={`h-10 rounded px-3 text-sm font-bold ${mode === 'sign-in' ? 'bg-white shadow-sm' : 'text-slate-600'}`}
            >
              Sign in
            </button>
            <button
              onClick={() => setMode('sign-up')}
              className={`h-10 rounded px-3 text-sm font-bold ${mode === 'sign-up' ? 'bg-white shadow-sm' : 'text-slate-600'}`}
            >
              Create account
            </button>
          </div>

          <div className="mt-6 space-y-4">
            {mode === 'sign-up' && (
              <>
                <label className="block">
                  <span className="text-sm font-semibold text-slate-700">Display name</span>
                  <input
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    className="mt-1 h-11 w-full rounded-md border border-slate-300 px-3 outline-none focus:border-blue-500"
                    placeholder="Dinesh"
                  />
                </label>

                <label className="block">
                  <span className="text-sm font-semibold text-slate-700">Phone / WhatsApp number</span>
                  <input
                    value={whatsappNumber}
                    onChange={(event) => setWhatsappNumber(event.target.value)}
                    className="mt-1 h-11 w-full rounded-md border border-slate-300 px-3 outline-none focus:border-blue-500"
                    placeholder="+1 555 0100"
                  />
                  <span className="mt-1 block text-xs text-slate-500">
                    Optional. Include country code if entered, for example +1 or +91.
                  </span>
                </label>

                <label className="block">
                  <span className="text-sm font-semibold text-slate-700">Reminder preference</span>
                  <select
                    value={notificationChannel}
                    onChange={(event) => setNotificationChannel(event.target.value as NotificationChannel)}
                    className="mt-1 h-11 w-full rounded-md border border-slate-300 bg-white px-3 outline-none focus:border-blue-500"
                  >
                    <option value="email">Email only</option>
                    <option value="phone">Phone only</option>
                    <option value="both">Email and phone</option>
                  </select>
                </label>
              </>
            )}

            <label className="block">
              <span className="text-sm font-semibold text-slate-700">Email</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="mt-1 h-11 w-full rounded-md border border-slate-300 px-3 outline-none focus:border-blue-500"
                placeholder="you@example.com"
              />
            </label>

            <label className="block">
              <span className="text-sm font-semibold text-slate-700">Password</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="mt-1 h-11 w-full rounded-md border border-slate-300 px-3 outline-none focus:border-blue-500"
                placeholder="At least 6 characters"
              />
            </label>

            {message && <p className="rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-950">{message}</p>}

            <button
              disabled={busy}
              onClick={handleEmailAuth}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {mode === 'sign-in' ? 'Sign in' : 'Create account'}
              <ArrowRight size={18} />
            </button>
          </div>

          <div className="my-5 flex items-center gap-3 text-xs uppercase text-slate-400">
            <div className="h-px flex-1 bg-slate-200" />
            or
            <div className="h-px flex-1 bg-slate-200" />
          </div>

          <div className="grid gap-2">
            <button
              disabled={busy}
              onClick={() => handleOAuth('google')}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-slate-300 px-4 text-sm font-bold hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Mail size={18} />
              Continue with Google
            </button>
            <button
              disabled={busy}
              onClick={() => handleOAuth('facebook')}
              className="inline-flex h-11 items-center justify-center rounded-md border border-slate-300 px-4 text-sm font-bold hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Continue with Facebook
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
