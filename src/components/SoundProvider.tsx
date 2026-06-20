'use client';

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

// ---------------------------------------------------------------------------
// Shared, synthesized interface sound effects (Web Audio API, no audio files).
// One AudioContext for the whole app, created lazily and resumed on the
// user's first click/keypress — nothing plays before that gesture unlocks it.
// ---------------------------------------------------------------------------

const MUTE_STORAGE_KEY = 'jarvis:soundMuted';

let sharedCtx: AudioContext | null = null;

export function getSharedAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioContextCtor =
    window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) return null;
  if (!sharedCtx) sharedCtx = new AudioContextCtor();
  return sharedCtx;
}

interface ThinkingHandle {
  oscA: OscillatorNode;
  oscB: OscillatorNode;
  lfo: OscillatorNode;
  gain: GainNode;
}

interface SoundContextValue {
  muted: boolean;
  toggleMute: () => void;
  playHover: () => void;
  playConfirm: () => void;
  playAlert: () => void;
  startThinking: () => void;
  stopThinking: () => void;
}

const SoundContext = createContext<SoundContextValue | undefined>(undefined);

export function SoundProvider({ children }: { children: React.ReactNode }) {
  const [muted, setMuted] = useState(false);
  const unlockedRef = useRef(false);
  const thinkingRef = useRef<ThinkingHandle | null>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem(MUTE_STORAGE_KEY);
    if (stored !== null) setMuted(stored === 'true');
  }, []);

  useEffect(() => {
    const unlock = () => {
      if (unlockedRef.current) return;
      unlockedRef.current = true;
      const ctx = getSharedAudioContext();
      if (ctx && ctx.state === 'suspended') ctx.resume();
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      window.localStorage.setItem(MUTE_STORAGE_KEY, String(next));
      if (!next) {
        // Unmuting still requires the gesture-unlock; this click itself counts.
        unlockedRef.current = true;
        const ctx = getSharedAudioContext();
        if (ctx && ctx.state === 'suspended') ctx.resume();
      }
      return next;
    });
  }, []);

  const ready = useCallback(() => {
    if (!unlockedRef.current || muted) return null;
    return getSharedAudioContext();
  }, [muted]);

  const playHover = useCallback(() => {
    const ctx = ready();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1900, now);
    osc.frequency.exponentialRampToValueAtTime(2300, now + 0.03);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.035, now + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.06);
  }, [ready]);

  const playConfirm = useCallback(() => {
    const ctx = ready();
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes: Array<{ freq: number; start: number; dur: number }> = [
      { freq: 880, start: 0, dur: 0.08 },
      { freq: 1320, start: 0.09, dur: 0.12 },
    ];

    notes.forEach(({ freq, start, dur }) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + start);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, now + start);
      gain.gain.exponentialRampToValueAtTime(0.18, now + start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + start);
      osc.stop(now + start + dur + 0.02);
    });
  }, [ready]);

  const playAlert = useCallback(() => {
    const ctx = ready();
    if (!ctx) return;
    const now = ctx.currentTime;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1100;
    filter.Q.value = 5;

    [0, 0.11].forEach((start) => {
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.setValueAtTime(1050, now + start);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, now + start);
      gain.gain.exponentialRampToValueAtTime(0.1, now + start + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + start + 0.09);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + start);
      osc.stop(now + start + 0.1);
    });
  }, [ready]);

  const startThinking = useCallback(() => {
    if (thinkingRef.current) return;
    const ctx = ready();
    if (!ctx) return;
    const now = ctx.currentTime;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 460;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.045, now + 0.4);

    const oscA = ctx.createOscillator();
    oscA.type = 'sine';
    oscA.frequency.value = 92;

    const oscB = ctx.createOscillator();
    oscB.type = 'sine';
    oscB.frequency.value = 138;

    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.18;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.015;
    lfo.connect(lfoGain);
    lfoGain.connect(gain.gain);

    oscA.connect(filter);
    oscB.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    oscA.start(now);
    oscB.start(now);
    lfo.start(now);

    thinkingRef.current = { oscA, oscB, lfo, gain };
  }, [ready]);

  const stopThinking = useCallback(() => {
    const handle = thinkingRef.current;
    thinkingRef.current = null;
    if (!handle) return;
    const ctx = getSharedAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    handle.gain.gain.cancelScheduledValues(now);
    handle.gain.gain.setValueAtTime(handle.gain.gain.value || 0.0001, now);
    handle.gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
    handle.oscA.stop(now + 0.32);
    handle.oscB.stop(now + 0.32);
    handle.lfo.stop(now + 0.32);
  }, []);

  return (
    <SoundContext.Provider value={{ muted, toggleMute, playHover, playConfirm, playAlert, startThinking, stopThinking }}>
      {children}
    </SoundContext.Provider>
  );
}

export const useSound = () => {
  const context = useContext(SoundContext);
  if (context === undefined) {
    throw new Error('useSound must be used within a SoundProvider');
  }
  return context;
};
