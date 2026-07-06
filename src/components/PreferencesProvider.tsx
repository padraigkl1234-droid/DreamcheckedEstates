'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

// Device-level preferences (stored per browser): haptics, plus a live
// online/offline signal for the offline-sync indicator. Notification-category
// filters live on the user profile in Firestore (so the push server can
// respect them) — see NotifPrefs in lib/teams.ts.

export interface Preferences {
  haptics: boolean;
}

const DEFAULTS: Preferences = {
  haptics: true,
};

const STORAGE_KEY = 'invictus-prefs';

interface PreferencesContextType {
  prefs: Preferences;
  setPref: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void;
  haptic: (pattern?: number | number[]) => void;
  online: boolean;
}

const PreferencesContext = createContext<PreferencesContextType | undefined>(undefined);

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const [prefs, setPrefs] = useState<Preferences>(DEFAULTS);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setPrefs({ ...DEFAULTS, ...JSON.parse(raw) });
    } catch {
      /* ignore */
    }
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  const setPref = useCallback(<K extends keyof Preferences>(key: K, value: Preferences[K]) => {
    setPrefs((prev) => {
      const next = { ...prev, [key]: value };
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  // Fire a short vibration on confirmations when haptics are on (Android/Chrome;
  // iOS Safari doesn't support the Vibration API, so this is a no-op there).
  const haptic = useCallback(
    (pattern: number | number[] = 15) => {
      if (!prefs.haptics) return;
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(pattern);
      }
    },
    [prefs.haptics]
  );

  return (
    <PreferencesContext.Provider value={{ prefs, setPref, haptic, online }}>
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences() {
  const ctx = useContext(PreferencesContext);
  if (ctx === undefined) throw new Error('usePreferences must be used within a PreferencesProvider');
  return ctx;
}
