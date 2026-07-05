'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Settings as SettingsIcon, User as UserFallback, Loader2, Check, LogOut, Moon, Sun, Monitor, Volume2, VolumeX } from 'lucide-react';
import { doc, setDoc } from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '@/lib/firebase';
import { useAuth } from '@/components/AuthProvider';
import { useProfile } from '@/components/ProfileProvider';
import { useTheme, type ThemePref } from '@/components/ThemeProvider';
import { useSound } from '@/components/SoundProvider';
import { profileName } from '@/lib/teams';

const inputClass =
  'w-full rounded-md border border-neutral-400/30 bg-invictus-base/60 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-invictus-crimson-bright focus:outline-none focus:ring-1 focus:ring-invictus-crimson-bright/50';

const THEME_OPTIONS: { value: ThemePref; label: string; icon: typeof Moon }[] = [
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'system', label: 'System', icon: Monitor },
];

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const { profile, team } = useProfile();
  const { theme, setTheme } = useTheme();
  const { muted, toggleMute } = useSound();
  const [displayName, setDisplayName] = useState('');
  const [teamRole, setTeamRole] = useState('');
  const [photoURL, setPhotoURL] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Seed the form from the profile once it loads.
  useEffect(() => {
    if (!profile) return;
    setDisplayName(profile.displayName ?? profile.name ?? '');
    setTeamRole(profile.teamRole ?? '');
    setPhotoURL(profile.photoURL ?? null);
  }, [profile?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (!user) return;
    setSaving(true);
    setError(null);
    try {
      await setDoc(
        doc(db, 'users', user.uid),
        { displayName: displayName.trim(), teamRole: teamRole.trim(), photoURL: photoURL ?? null },
        { merge: true }
      );
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (e) {
      console.error('Save profile failed:', e);
      setError('Save failed — try again.');
    } finally {
      setSaving(false);
    }
  };

  const onPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !user) return;
    if (file.size > 5 * 1024 * 1024) {
      setError('Profile picture must be 5 MB or under.');
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const path = `profiles/${user.uid}/${Date.now()}-${file.name}`;
      const r = storageRef(storage, path);
      await uploadBytes(r, file);
      const url = await getDownloadURL(r);
      setPhotoURL(url);
      await setDoc(doc(db, 'users', user.uid), { photoURL: url }, { merge: true });
    } catch (err) {
      console.error('Photo upload failed:', err);
      setError('Upload failed — make sure Storage rules allow profile uploads.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="relative min-h-[calc(100vh-4rem)] w-full overflow-hidden bg-invictus-base font-sans text-neutral-100">
      <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-neutral-500/10 blur-3xl" />
      <div className="relative z-10 mx-auto max-w-2xl px-4 py-8 sm:py-10">
        <div className="mb-8 flex items-center gap-3">
          <SettingsIcon className="h-8 w-8 text-invictus-crimson-bright drop-shadow-glow-subtle" />
          <div>
            <h1 className="font-display text-2xl uppercase tracking-[0.2em] text-neutral-100 [text-shadow:var(--glow-text-subtle)] sm:text-3xl">
              Settings
            </h1>
            <p className="text-[11px] uppercase tracking-[0.25em] text-neutral-500">Your profile &amp; team</p>
          </div>
        </div>

        <div className="space-y-5 border border-neutral-400/25 bg-invictus-surface/60 p-6 shadow-glow-subtle">
          {/* Avatar */}
          <div className="flex items-center gap-4">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border border-invictus-crimson-bright/30 bg-invictus-crimson-bright/10">
              {photoURL ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photoURL} alt="Profile" className="h-full w-full object-cover" />
              ) : (
                <UserFallback className="h-8 w-8 text-invictus-crimson-bright" />
              )}
            </div>
            <div>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPhoto} />
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-2 rounded-md border border-neutral-400/30 bg-invictus-base/60 px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-neutral-300 transition-colors hover:border-invictus-crimson-bright/40 hover:text-invictus-crimson-bright disabled:opacity-50"
              >
                {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                {photoURL ? 'Change picture' : 'Upload picture'}
              </button>
              <p className="mt-1 text-[10px] text-neutral-600">JPG or PNG, up to 5 MB.</p>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-widest text-neutral-500">Display name</label>
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Your name" className={inputClass} />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-widest text-neutral-500">Team role</label>
            <input
              value={teamRole}
              onChange={(e) => setTeamRole(e.target.value)}
              placeholder="e.g. Estates Manager, Duty Manager"
              className={inputClass}
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-widest text-neutral-500">Team</label>
            <p className="rounded-md border border-neutral-400/20 bg-invictus-base/40 px-3 py-2 text-sm text-neutral-300">
              {team?.name ?? '—'}
            </p>
          </div>

          {error && <p className="text-xs text-alert">{error}</p>}

          <button
            onClick={save}
            disabled={saving}
            className="flex w-full items-center justify-center gap-2 rounded-md border border-invictus-crimson-bright/60 bg-invictus-crimson-bright/10 py-2.5 text-xs font-semibold uppercase tracking-widest text-neutral-100 shadow-glow-subtle transition-all hover:bg-invictus-crimson-bright/20 hover:shadow-glow-strong disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : null}
            {saved ? 'Saved' : 'Save changes'}
          </button>
        </div>

        {/* Appearance */}
        <div className="mt-6 space-y-4 border border-neutral-400/25 bg-invictus-surface/60 p-6 shadow-glow-subtle">
          <p className="font-display text-sm uppercase tracking-[0.2em] text-neutral-100 [text-shadow:var(--glow-text-subtle)]">
            Appearance
          </p>
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-widest text-neutral-500">Theme</label>
            <div className="grid grid-cols-3 gap-2">
              {THEME_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const active = theme === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => setTheme(opt.value)}
                    className={`flex flex-col items-center gap-1.5 rounded-md border py-3 text-[10px] font-semibold uppercase tracking-widest transition-all ${
                      active
                        ? 'border-invictus-crimson-bright/60 bg-invictus-crimson-bright/10 text-neutral-100 shadow-glow-subtle'
                        : 'border-neutral-400/30 bg-invictus-base/60 text-neutral-500 hover:border-invictus-crimson-bright/40 hover:text-neutral-300'
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                    {opt.label}
                  </button>
                );
              })}
            </div>
            <p className="pt-1 text-[10px] text-neutral-600">
              INVICTUS is designed dark-first; light mode is a lighter take on the same theme.
            </p>
          </div>
        </div>

        {/* Preferences */}
        <div className="mt-6 space-y-4 border border-neutral-400/25 bg-invictus-surface/60 p-6 shadow-glow-subtle">
          <p className="font-display text-sm uppercase tracking-[0.2em] text-neutral-100 [text-shadow:var(--glow-text-subtle)]">
            Preferences
          </p>
          <button
            onClick={toggleMute}
            className="flex w-full items-center justify-between rounded-md border border-neutral-400/25 bg-invictus-base/40 px-4 py-3 text-left transition-colors hover:border-invictus-crimson-bright/40"
          >
            <span className="flex items-center gap-3">
              {muted ? <VolumeX className="h-4 w-4 text-neutral-500" /> : <Volume2 className="h-4 w-4 text-invictus-crimson-bright" />}
              <span className="text-sm text-neutral-200">Interface sounds</span>
            </span>
            <span className={`text-[10px] font-semibold uppercase tracking-widest ${muted ? 'text-neutral-600' : 'text-emerald-300'}`}>
              {muted ? 'Off' : 'On'}
            </span>
          </button>
        </div>

        {/* About */}
        <div className="mt-6 space-y-2 border border-neutral-400/25 bg-invictus-surface/60 p-6 shadow-glow-subtle">
          <p className="font-display text-sm uppercase tracking-[0.2em] text-neutral-100 [text-shadow:var(--glow-text-subtle)]">
            About
          </p>
          <div className="flex justify-between text-xs text-neutral-500">
            <span>Application</span>
            <span className="text-neutral-300">INVICTUS · Estate Operations Platform</span>
          </div>
          <div className="flex justify-between text-xs text-neutral-500">
            <span>Version</span>
            <span className="font-mono text-neutral-300">2.0</span>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between text-[11px] text-neutral-600">
          <span>Signed in as {profileName(profile)} · {user?.email}</span>
          <button onClick={() => logout()} className="flex items-center gap-1.5 uppercase tracking-widest transition-colors hover:text-alert">
            <LogOut className="h-3.5 w-3.5" /> Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
