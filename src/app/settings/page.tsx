'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Settings as SettingsIcon, User as UserFallback, Loader2, Check, LogOut, Moon, Sun, Monitor, Volume2, VolumeX, Vibrate, Bell, BellRing, Wifi, WifiOff } from 'lucide-react';
import { doc, setDoc } from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '@/lib/firebase';
import { useAuth } from '@/components/AuthProvider';
import { useProfile } from '@/components/ProfileProvider';
import { useTheme, type ThemePref } from '@/components/ThemeProvider';
import { useSound } from '@/components/SoundProvider';
import { usePreferences } from '@/components/PreferencesProvider';
import { useLang } from '@/components/LanguageProvider';
import { LANGUAGES } from '@/lib/i18n';
import { InvictusSelect } from '@/components/InvictusSelect';
import { profileName, notifEnabled, type NotifPrefs } from '@/lib/teams';
import { enablePush, disablePush, notificationPermission } from '@/lib/messaging';

const inputClass =
  'w-full rounded-md border border-neutral-400/30 bg-invictus-base/60 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-invictus-crimson-bright focus:outline-none focus:ring-1 focus:ring-invictus-crimson-bright/50';

const THEME_OPTIONS: { value: ThemePref; label: string; icon: typeof Moon }[] = [
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'system', label: 'System', icon: Monitor },
];

function ToggleRow({
  label,
  on,
  onToggle,
  onLabel,
  offLabel,
  icon,
  disabled = false,
}: {
  label: string;
  on: boolean;
  onToggle: () => void;
  onLabel: string;
  offLabel: string;
  icon?: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onToggle}
      disabled={disabled}
      className="flex w-full items-center justify-between rounded-md border border-neutral-400/25 bg-invictus-base/40 px-4 py-3 text-left transition-colors hover:border-invictus-crimson-bright/40 disabled:opacity-50"
    >
      <span className="flex items-center gap-3">
        {icon}
        <span className="text-sm text-neutral-200">{label}</span>
      </span>
      <span className={`text-[10px] font-semibold uppercase tracking-widest ${on ? 'text-emerald-300' : 'text-neutral-600'}`}>
        {on ? onLabel : offLabel}
      </span>
    </button>
  );
}

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const { profile, team } = useProfile();
  const { theme, setTheme } = useTheme();
  const { muted, toggleMute } = useSound();
  const { prefs, setPref, haptic, online } = usePreferences();
  const { lang, setLang, t } = useLang();
  const [displayName, setDisplayName] = useState('');
  const [teamRole, setTeamRole] = useState('');
  const [photoURL, setPhotoURL] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Push-notification state. `permission` mirrors the browser's grant; `pushBusy`
  // guards the enable/disable button while a request is in flight.
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('unsupported');
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  useEffect(() => {
    setPermission(notificationPermission());
  }, []);

  const notifPrefs = profile?.notifPrefs;
  const setNotifPref = async (key: keyof NotifPrefs, value: boolean) => {
    if (!user) return;
    try {
      await setDoc(doc(db, 'users', user.uid), { notifPrefs: { [key]: value } }, { merge: true });
    } catch (e) {
      console.error('Save notification pref failed:', e);
    }
  };

  // Self-test: push a notification to this user's own devices.
  const [testState, setTestState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [testMsg, setTestMsg] = useState<string | null>(null);
  const sendTest = async () => {
    if (!user || testState === 'sending') return;
    setTestState('sending');
    setTestMsg(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/notify/test', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setTestState('sent');
        setTestMsg(t('settings.pushTestSent'));
      } else {
        setTestState('error');
        setTestMsg(data.reason === 'no-devices' ? t('settings.pushTestNoDevices') : t('settings.pushTestFailed'));
      }
    } catch {
      setTestState('error');
      setTestMsg(t('settings.pushTestFailed'));
    } finally {
      setTimeout(() => setTestState('idle'), 4000);
    }
  };

  const pushEnabled = permission === 'granted';
  const togglePush = async () => {
    if (!user || pushBusy) return;
    setPushBusy(true);
    setPushError(null);
    try {
      if (pushEnabled) {
        await disablePush(user.uid);
        // Permission can't be revoked programmatically; we just drop the token.
        // Reflect that devices won't receive pushes by leaving permission as-is
        // but the token is gone. Re-enabling re-registers a token.
      } else {
        const res = await enablePush(user.uid);
        if (!res.ok) {
          const messages: Record<string, string> = {
            unsupported: 'This browser/device does not support push notifications.',
            denied: 'Notifications are blocked. Enable them in your browser settings.',
            'no-vapid': 'Push is not configured yet (missing VAPID key).',
            'no-token': 'Could not register this device. Try again.',
            error: 'Something went wrong enabling notifications.',
          };
          setPushError(messages[res.reason || 'error'] || messages.error);
        }
      }
      setPermission(notificationPermission());
    } finally {
      setPushBusy(false);
    }
  };

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
              {t('settings.title')}
            </h1>
            <p className="text-[11px] uppercase tracking-[0.25em] text-neutral-500">{t('settings.subtitle')}</p>
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
                {photoURL ? t('settings.changePicture') : t('settings.uploadPicture')}
              </button>
              <p className="mt-1 text-[10px] text-neutral-600">{t('settings.pictureHint')}</p>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-widest text-neutral-500">{t('settings.displayName')}</label>
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className={inputClass} />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-widest text-neutral-500">{t('settings.teamRole')}</label>
            <input
              value={teamRole}
              onChange={(e) => setTeamRole(e.target.value)}
              placeholder="e.g. Estates Manager, Duty Manager"
              className={inputClass}
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-widest text-neutral-500">{t('settings.team')}</label>
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
            {saved ? t('settings.saved') : t('settings.save')}
          </button>
        </div>

        {/* Appearance */}
        <div className="mt-6 space-y-4 border border-neutral-400/25 bg-invictus-surface/60 p-6 shadow-glow-subtle">
          <p className="font-display text-sm uppercase tracking-[0.2em] text-neutral-100 [text-shadow:var(--glow-text-subtle)]">
            {t('settings.appearance')}
          </p>
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-widest text-neutral-500">{t('settings.language')}</label>
            <InvictusSelect
              value={lang}
              onChange={(v) => setLang(v as typeof lang)}
              options={LANGUAGES.map((l) => ({ value: l.code, label: l.label }))}
            />
            <p className="pt-1 text-[10px] text-neutral-600">{t('settings.languageHint')}</p>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-widest text-neutral-500">{t('settings.theme')}</label>
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
                    {t(`settings.${opt.value}`)}
                  </button>
                );
              })}
            </div>
            <p className="pt-1 text-[10px] text-neutral-600">{t('settings.themeHint')}</p>
          </div>
        </div>

        {/* Preferences */}
        <div className="mt-6 space-y-4 border border-neutral-400/25 bg-invictus-surface/60 p-6 shadow-glow-subtle">
          <p className="font-display text-sm uppercase tracking-[0.2em] text-neutral-100 [text-shadow:var(--glow-text-subtle)]">
            {t('settings.preferences')}
          </p>
          <button
            onClick={toggleMute}
            className="flex w-full items-center justify-between rounded-md border border-neutral-400/25 bg-invictus-base/40 px-4 py-3 text-left transition-colors hover:border-invictus-crimson-bright/40"
          >
            <span className="flex items-center gap-3">
              {muted ? <VolumeX className="h-4 w-4 text-neutral-500" /> : <Volume2 className="h-4 w-4 text-invictus-crimson-bright" />}
              <span className="text-sm text-neutral-200">{t('settings.interfaceSounds')}</span>
            </span>
            <span className={`text-[10px] font-semibold uppercase tracking-widest ${muted ? 'text-neutral-600' : 'text-emerald-300'}`}>
              {muted ? t('common.off') : t('common.on')}
            </span>
          </button>
          <ToggleRow
            label={t('settings.haptics')}
            on={prefs.haptics}
            onToggle={() => {
              const next = !prefs.haptics;
              setPref('haptics', next);
              if (next) haptic(); // buzz once so they feel it when turning it on
            }}
            onLabel={t('common.on')}
            offLabel={t('common.off')}
            icon={<Vibrate className={`h-4 w-4 ${prefs.haptics ? 'text-invictus-crimson-bright' : 'text-neutral-500'}`} />}
          />
          <p className="text-[10px] text-neutral-600">{t('settings.hapticsHint')}</p>
        </div>

        {/* Notifications */}
        <div className="mt-6 space-y-3 border border-neutral-400/25 bg-invictus-surface/60 p-6 shadow-glow-subtle">
          <p className="font-display text-sm uppercase tracking-[0.2em] text-neutral-100 [text-shadow:var(--glow-text-subtle)]">
            {t('settings.notifications')}
          </p>

          {/* Master push enable/disable for this device. */}
          {permission === 'unsupported' ? (
            <p className="rounded-md border border-neutral-400/25 bg-invictus-base/40 px-4 py-3 text-[11px] text-neutral-500">
              {t('settings.pushUnsupported')}
            </p>
          ) : (
            <ToggleRow
              label={t('settings.pushEnable')}
              on={pushEnabled}
              onToggle={togglePush}
              onLabel={t('common.on')}
              offLabel={t('common.off')}
              disabled={pushBusy}
              icon={<Bell className={`h-4 w-4 ${pushEnabled ? 'text-invictus-crimson-bright' : 'text-neutral-500'}`} />}
            />
          )}
          {pushError && <p className="text-[10px] text-alert">{pushError}</p>}
          <p className="text-[10px] text-neutral-600">{t('settings.pushHint')}</p>

          {/* One-tap self-test so a user can verify delivery on their own device. */}
          {pushEnabled && (
            <>
              <button
                onClick={sendTest}
                disabled={testState === 'sending'}
                className="flex w-full items-center justify-center gap-2 rounded-md border border-neutral-400/30 bg-invictus-base/60 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-neutral-300 transition-colors hover:border-invictus-crimson-bright/40 hover:text-invictus-crimson-bright disabled:opacity-50"
              >
                {testState === 'sending' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : testState === 'sent' ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <BellRing className="h-3.5 w-3.5" />
                )}
                {t('settings.pushTest')}
              </button>
              {testMsg && (
                <p className={`text-[10px] ${testState === 'error' ? 'text-alert' : 'text-emerald-300'}`}>{testMsg}</p>
              )}
            </>
          )}

          {/* Which categories to receive. Only meaningful once push is on. */}
          {(
            [
              ['urgentCompliance', 'settings.notifUrgentCompliance'],
              ['taskAssignments', 'settings.notifTaskAssignments'],
              ['dailySummary', 'settings.notifDailySummary'],
            ] as [keyof NotifPrefs, string][]
          ).map(([key, labelKey]) => {
            const on = notifEnabled(notifPrefs, key);
            return (
              <ToggleRow
                key={key}
                label={t(labelKey)}
                on={on}
                onToggle={() => setNotifPref(key, !on)}
                onLabel={t('common.on')}
                offLabel={t('common.off')}
                disabled={!pushEnabled}
                icon={<Bell className={`h-4 w-4 ${on ? 'text-invictus-crimson-bright' : 'text-neutral-500'}`} />}
              />
            );
          })}
        </div>

        {/* Data & sync */}
        <div className="mt-6 space-y-3 border border-neutral-400/25 bg-invictus-surface/60 p-6 shadow-glow-subtle">
          <p className="font-display text-sm uppercase tracking-[0.2em] text-neutral-100 [text-shadow:var(--glow-text-subtle)]">
            {t('settings.dataSync')}
          </p>
          <div className="flex items-center justify-between rounded-md border border-neutral-400/25 bg-invictus-base/40 px-4 py-3">
            <span className="flex items-center gap-3">
              {online ? <Wifi className="h-4 w-4 text-emerald-400" /> : <WifiOff className="h-4 w-4 text-amber-400" />}
              <span className="text-sm text-neutral-200">{t('settings.connection')}</span>
            </span>
            <span className={`text-[10px] font-semibold uppercase tracking-widest ${online ? 'text-emerald-300' : 'text-amber-300'}`}>
              {online ? t('settings.online') : t('settings.offline')}
            </span>
          </div>
          <p className="text-[10px] text-neutral-600">{t('settings.offlineHint')}</p>
        </div>

        {/* About */}
        <div className="mt-6 space-y-2 border border-neutral-400/25 bg-invictus-surface/60 p-6 shadow-glow-subtle">
          <p className="font-display text-sm uppercase tracking-[0.2em] text-neutral-100 [text-shadow:var(--glow-text-subtle)]">
            {t('settings.about')}
          </p>
          <div className="flex justify-between text-xs text-neutral-500">
            <span>{t('settings.application')}</span>
            <span className="text-neutral-300">INVICTUS · {t('gate.tagline')}</span>
          </div>
          <div className="flex justify-between text-xs text-neutral-500">
            <span>{t('settings.version')}</span>
            <span className="font-mono text-neutral-300">2.0</span>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between text-[11px] text-neutral-600">
          <span>{t('common.signedInAs')} {profileName(profile)} · {user?.email}</span>
          <button onClick={() => logout()} className="flex items-center gap-1.5 uppercase tracking-widest transition-colors hover:text-alert">
            <LogOut className="h-3.5 w-3.5" /> {t('common.signOut')}
          </button>
        </div>
      </div>
    </div>
  );
}
