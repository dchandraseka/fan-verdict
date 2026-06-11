"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { ArrowLeft, Camera, KeyRound, Save, Trash2, Trophy, Upload, UserRound } from 'lucide-react';
import { ensureProfile } from '@/lib/account';
import { getErrorMessage } from '@/lib/errors';
import { validateOptionalInternationalPhone } from '@/lib/phone';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import type { NotificationChannel, Profile } from '@/lib/types';

const PROFILE_PHOTO_BUCKET = 'profile-photos';
const MAX_PROFILE_PHOTO_BYTES = 5 * 1024 * 1024;
const ALLOWED_PROFILE_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

function normalizeChannel(channel: NotificationChannel | string | null | undefined): NotificationChannel {
  if (channel === 'none') return 'none';
  return 'email';
}

function profileInitials(name: string | null | undefined, fallback: string | null | undefined) {
  const source = name?.trim() || fallback?.trim() || 'FanVerdict Player';
  return source
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'FV';
}

function photoExtension(file: File) {
  if (file.type === 'image/jpeg') return 'jpg';
  if (file.type === 'image/png') return 'png';
  if (file.type === 'image/webp') return 'webp';
  if (file.type === 'image/gif') return 'gif';
  return file.name.split('.').pop()?.toLowerCase() || 'jpg';
}

function uniquePhotoPath(userId: string, file: File) {
  const randomPart =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);

  return `${userId}/${Date.now()}-${randomPart}.${photoExtension(file)}`;
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
  const [photoBusy, setPhotoBusy] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const profilePhotoUrl = useMemo(() => {
    if (!profile?.avatar_path) return '';
    return supabase.storage.from(PROFILE_PHOTO_BUCKET).getPublicUrl(profile.avatar_path).data.publicUrl;
  }, [profile?.avatar_path]);

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

  const handlePhotoSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (!session) {
      setMessage('Sign in before updating your profile photo.');
      return;
    }

    if (!ALLOWED_PROFILE_PHOTO_TYPES.includes(file.type)) {
      setMessage('Upload a JPG, PNG, WEBP, or GIF image.');
      return;
    }

    if (file.size > MAX_PROFILE_PHOTO_BYTES) {
      setMessage('Profile photo must be 5 MB or smaller.');
      return;
    }

    setPhotoBusy(true);
    setMessage('');

    const nextPath = uniquePhotoPath(session.user.id, file);
    const previousPath = profile?.avatar_path;

    try {
      const { error: uploadError } = await supabase.storage
        .from(PROFILE_PHOTO_BUCKET)
        .upload(nextPath, file, {
          cacheControl: '3600',
          contentType: file.type,
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { data, error: profileError } = await supabase
        .from('profiles')
        .update({
          avatar_path: nextPath,
          email: session.user.email,
        })
        .eq('id', session.user.id)
        .select('*')
        .single();

      if (profileError) {
        await supabase.storage.from(PROFILE_PHOTO_BUCKET).remove([nextPath]);
        throw profileError;
      }

      setProfile(data as Profile);
      if (previousPath && previousPath !== nextPath) {
        await supabase.storage.from(PROFILE_PHOTO_BUCKET).remove([previousPath]);
      }
      setMessage('Profile photo updated.');
    } catch (error) {
      setMessage(getErrorMessage(error, 'Unable to update profile photo.'));
    } finally {
      setPhotoBusy(false);
    }
  };

  const removeProfilePhoto = async () => {
    if (!session || !profile?.avatar_path) return;

    setPhotoBusy(true);
    setMessage('');

    const previousPath = profile.avatar_path;

    try {
      const { data, error } = await supabase
        .from('profiles')
        .update({
          avatar_path: null,
          email: session.user.email,
        })
        .eq('id', session.user.id)
        .select('*')
        .single();

      if (error) throw error;

      setProfile(data as Profile);
      await supabase.storage.from(PROFILE_PHOTO_BUCKET).remove([previousPath]);
      setMessage('Profile photo removed.');
    } catch (error) {
      setMessage(getErrorMessage(error, 'Unable to remove profile photo.'));
    } finally {
      setPhotoBusy(false);
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
              Profile and Communication
            </h2>

            <div className="mt-4 grid gap-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                  <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-white text-2xl font-black text-blue-700">
                    {profilePhotoUrl ? (
                      <img
                        src={profilePhotoUrl}
                        alt={`${profile?.display_name ?? 'Profile'} photo`}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      profileInitials(displayName, session.user.email)
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                      <Camera size={16} />
                      Profile photo
                    </h3>
                    <p className="mt-1 text-xs text-slate-500">Upload a JPG, PNG, WEBP, or GIF image up to 5 MB.</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        disabled={photoBusy}
                        onClick={() => photoInputRef.current?.click()}
                        className="inline-flex h-10 items-center gap-2 rounded-md bg-blue-600 px-3 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <Upload size={16} />
                        {profile?.avatar_path ? 'Change photo' : 'Upload photo'}
                      </button>
                      {profile?.avatar_path && (
                        <button
                          disabled={photoBusy}
                          onClick={removeProfilePhoto}
                          className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 px-3 text-sm font-semibold hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <Trash2 size={16} />
                          Remove
                        </button>
                      )}
                    </div>
                    <input
                      ref={photoInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      onChange={handlePhotoSelected}
                      className="hidden"
                    />
                  </div>
                </div>
              </div>

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
                  <option value="none">No reminders</option>
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
