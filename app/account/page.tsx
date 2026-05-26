"use client";

import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { ArrowLeft, KeyRound, Save, Trophy, UserRound } from 'lucide-react';
import { ensureProfile } from '@/lib/account';
import { getErrorMessage } from '@/lib/errors';
import { validateOptionalInternationalPhone } from '@/lib/phone';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import type { NotificationChannel, Profile } from '@/lib/types';

function normalizeChannel(channel: NotificationChannel | string | null | undefined): NotificationChannel {
  if (channel === 'whatsapp') return 'phone';
  if (channel === 'phone' || channel === 'both' || channel === 'email') return channel;
  return 'email';
}

export default function AccountSettingsPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [notificationChannel, setNotificationChannel] = useState<NotificationChannel>('email');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      if (!data.session) return;

      try {
        const loadedProfile = await ensureProfile(data.session);
        setProfile(loadedProfile);
        setDisplayName(loadedProfile.display_name);
        setPhone(loadedProfile.whatsapp_number ?? '');
        setNotificationChannel(normalizeChannel(loadedProfile.notification_channel));
      } catch (error) {
        setMessage(getErrorMessage(error, 'Unable to load account settings.'));
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));

    return () => subscription.unsubscribe();
  }, []);

  const saveProfile = async () => {
    if (!session) {
      setMessage('Sign in before updating account settings.');
      return;
    }

    setBusy(true);
    setMessage('');

    try {
      const phoneValidation = validateOptionalInternationalPhone(phone);
      if (!phoneValidation.ok) {
        setMessage(phoneValidation.message ?? 'Invalid phone number.');
        return;
      }

      const { data, error } = await supabase
        .from('profiles')
        .update({
          display_name: displayName.trim() || profile?.display_name || 'FanVerdict Player',
          email: session.user.email,
          whatsapp_number: phoneValidation.value,
          notification_channel: notificationChannel,
        })
        .eq('id', session.user.id)
        .select('*')
        .single();

      if (error) throw error;

      const updatedProfile = data as Profile;
      setProfile(updatedProfile);
      setDisplayName(updatedProfile.display_name);
      setPhone(updatedProfile.whatsapp_number ?? '');
      setNotificationChannel(normalizeChannel(updatedProfile.notification_channel));
      setMessage('Account settings saved.');
    } catch (error) {
      setMessage(getErrorMessage(error, 'Unable to save account settings.'));
    } finally {
      setBusy(false);
    }
  };

  const changePassword = async () => {
    if (!session) {
      setMessage('Sign in before changing your password.');
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
      setMessage('Password updated.');
    } catch (error) {
      setMessage(getErrorMessage(error, 'Unable to update password.'));
    } finally {
      setBusy(false);
    }
  };

  if (!isSupabaseConfigured) {
    return (
      <main className="min-h-screen bg-slate-50 p-6">
        <div className="mx-auto max-w-xl rounded-lg border border-amber-200 bg-amber-50 p-6 text-amber-950">
          <h1 className="text-xl font-bold">Supabase environment is missing</h1>
          <p className="mt-2 text-sm">Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY before using account settings.</p>
        </div>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="min-h-screen bg-slate-50 p-6">
        <div className="mx-auto max-w-xl rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-bold">Sign in required</h1>
          <p className="mt-2 text-slate-600">Sign in before managing your account settings.</p>
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
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
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

      <main className="mx-auto max-w-5xl px-4 py-6">
        <header className="mb-6">
          <p className="flex items-center gap-2 text-xs font-bold uppercase text-blue-600">
            <UserRound size={16} />
            Account Settings
          </p>
          <h1 className="mt-1 text-3xl font-black">Profile, alerts, and password</h1>
          <p className="mt-2 text-sm text-slate-600">Signed in as {session.user.email}.</p>
        </header>

        {message && (
          <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-950">
            {message}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="flex items-center gap-2 font-bold">
              <UserRound size={18} />
              Communication Preferences
            </h2>

            <div className="mt-4 grid gap-4">
              <label className="block">
                <span className="text-sm font-semibold text-slate-700">Display name</span>
                <input
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  className="mt-1 h-11 w-full rounded-md border border-slate-300 px-3 outline-none focus:border-blue-500"
                />
              </label>

              <label className="block">
                <span className="text-sm font-semibold text-slate-700">Phone / WhatsApp number</span>
                <input
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  className="mt-1 h-11 w-full rounded-md border border-slate-300 px-3 outline-none focus:border-blue-500"
                  placeholder="+1 555 0100"
                />
                <span className="mt-1 block text-xs text-slate-500">
                  Optional. Include country code if entered, for example +1 or +91.
                </span>
              </label>

              <label className="block">
                <span className="text-sm font-semibold text-slate-700">Receive alerts by</span>
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

              <button
                disabled={busy}
                onClick={saveProfile}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Save size={16} />
                Save account settings
              </button>
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="flex items-center gap-2 font-bold">
              <KeyRound size={18} />
              Change Password
            </h2>

            <div className="mt-4 grid gap-4">
              <label className="block">
                <span className="text-sm font-semibold text-slate-700">New password</span>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  className="mt-1 h-11 w-full rounded-md border border-slate-300 px-3 outline-none focus:border-blue-500"
                  placeholder="At least 6 characters"
                />
              </label>

              <label className="block">
                <span className="text-sm font-semibold text-slate-700">Confirm new password</span>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  className="mt-1 h-11 w-full rounded-md border border-slate-300 px-3 outline-none focus:border-blue-500"
                  placeholder="Re-enter password"
                />
              </label>

              <button
                disabled={busy}
                onClick={changePassword}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-slate-900 px-4 text-sm font-bold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <KeyRound size={16} />
                Update password
              </button>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
