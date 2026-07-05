'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Send, Volume2 } from 'lucide-react';
import { Orb, type OrbState } from '@/components/Orb';
import { Clock } from '@/components/Clock';
import { useVoice } from '@/components/useVoice';
import { loadStore, saveStore, type JarvisStore } from '@/lib/store';

interface ChatTurn {
  role: 'user' | 'model';
  text: string;
}

interface Caption {
  text: string;
  role: 'user' | 'jarvis';
}

export default function JarvisPage() {
  const [isThinking, setIsThinking] = useState(false);
  const [thinkingAmp, setThinkingAmp] = useState(0);
  const [caption, setCaption] = useState<Caption | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  const storeRef = useRef<JarvisStore | null>(null);
  const historyRef = useRef<ChatTurn[]>([]);
  const captionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const thinkingRafRef = useRef<number | null>(null);

  useEffect(() => {
    storeRef.current = loadStore();
  }, []);

  const showCaption = useCallback((next: Caption, holdMs = 9000) => {
    if (captionTimeoutRef.current) clearTimeout(captionTimeoutRef.current);
    setCaption(next);
    captionTimeoutRef.current = setTimeout(() => setCaption(null), holdMs);
  }, []);

  const sendToJarvis = useCallback(
    async (text: string) => {
      const priorHistory = historyRef.current.slice(-16);
      const store = storeRef.current ?? loadStore();
      setIsThinking(true);
      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: text, history: priorHistory, store }),
        });
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error || 'Request failed');

        if (data.store) {
          storeRef.current = data.store;
          saveStore(data.store);
        }
        historyRef.current = [...priorHistory, { role: 'user', text }, { role: 'model', text: data.reply }];
        setIsThinking(false);
        showCaption({ text: data.reply, role: 'jarvis' }, Math.max(6000, data.reply.length * 90));
        voice.speak(data.reply);
      } catch (err) {
        console.error('JARVIS chat failed:', err);
        setIsThinking(false);
        const fallback = 'Apologies — I hit a snag processing that. Give me a moment and try again.';
        showCaption({ text: fallback, role: 'jarvis' });
        voice.speak(fallback);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [showCaption]
  );

  const handleUserMessage = useCallback(
    (text: string) => {
      if (!text.trim()) return;
      showCaption({ text, role: 'user' }, 4000);
      sendToJarvis(text.trim());
    },
    [sendToJarvis, showCaption]
  );

  const voice = useVoice({ onFinalTranscript: handleUserMessage });

  // Keep the orb alive with a synthetic pulse while waiting on the model.
  useEffect(() => {
    if (!isThinking) {
      if (thinkingRafRef.current) cancelAnimationFrame(thinkingRafRef.current);
      thinkingRafRef.current = null;
      setThinkingAmp(0);
      return;
    }
    const start = performance.now();
    const loop = (t: number) => {
      setThinkingAmp(0.22 + 0.18 * Math.sin(((t - start) / 1000) * 5));
      thinkingRafRef.current = requestAnimationFrame(loop);
    };
    thinkingRafRef.current = requestAnimationFrame(loop);
    return () => {
      if (thinkingRafRef.current) cancelAnimationFrame(thinkingRafRef.current);
    };
  }, [isThinking]);

  useEffect(() => () => {
    if (captionTimeoutRef.current) clearTimeout(captionTimeoutRef.current);
  }, []);

  const orbState: OrbState =
    voice.state === 'speaking' ? 'speaking' : voice.state === 'listening' || isThinking ? 'listening' : 'idle';

  const orbAmplitude =
    voice.state === 'listening' || voice.state === 'speaking' ? voice.amplitude : isThinking ? thinkingAmp : 0;

  const handleMicToggle = () => {
    if (voice.state === 'listening') {
      voice.stopListening();
      return;
    }
    if (voice.state === 'speaking') {
      voice.cancelSpeech();
      return;
    }
    if (isThinking) return;
    if (!voice.sttSupported) {
      setNotice('Voice input is not supported in this browser — use the text box below.');
      setTimeout(() => setNotice(null), 5000);
      return;
    }
    voice.startListening();
  };

  const handleSubmitText = (e: React.FormEvent) => {
    e.preventDefault();
    const text = inputValue.trim();
    if (!text || isThinking) return;
    setInputValue('');
    handleUserMessage(text);
  };

  const liveCaptionText =
    voice.state === 'listening' ? voice.interimTranscript || 'Listening…' : caption?.text ?? null;
  const liveCaptionRole = voice.state === 'listening' ? 'user' : caption?.role ?? 'user';

  return (
    <div className="relative flex h-[100dvh] w-full flex-col items-center justify-between overflow-hidden bg-black font-sans">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(56,189,248,0.07),transparent_65%)]" />
      <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-sky-500/5 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-sky-500/5 blur-3xl" />

      <div className="flex-1" />

      <div className="relative z-10 flex flex-col items-center gap-8 px-4">
        <button
          type="button"
          onClick={handleMicToggle}
          aria-label={voice.state === 'listening' ? 'Stop listening' : 'Activate JARVIS'}
          className="relative flex items-center justify-center rounded-full transition-transform duration-300 hover:scale-[1.02] focus:outline-none"
          style={{ width: 280, height: 280 }}
        >
          <Orb state={orbState} amplitude={orbAmplitude} size={280} />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="font-display text-sm font-normal tracking-[0.4em] text-white/90 sm:text-base [text-shadow:0_0_14px_rgba(255,255,255,0.45)]">
              JARVIS
            </span>
          </div>
        </button>

        <Clock />
      </div>

      <div className="flex-1" />

      <div className="relative z-10 flex w-full flex-col items-center gap-3 px-4 pb-6">
        {liveCaptionText && (
          <div
            className={`max-w-xl text-center text-sm transition-opacity duration-300 ${
              liveCaptionRole === 'jarvis' ? 'text-sky-200' : 'text-white/70'
            }`}
          >
            {liveCaptionRole === 'jarvis' && (
              <Volume2 className="mr-1.5 inline-block h-3.5 w-3.5 -translate-y-0.5" />
            )}
            {liveCaptionText}
          </div>
        )}

        {notice && <div className="max-w-xl text-center text-xs text-amber-300">{notice}</div>}

        <form onSubmit={handleSubmitText} className="flex w-full max-w-xl items-center gap-2">
          <div className="flex flex-1 items-center gap-2 rounded-full border border-sky-400/20 bg-white/[0.03] px-4 py-2.5 backdrop-blur-md focus-within:border-sky-400/50">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Ask JARVIS…"
              className="flex-1 bg-transparent text-sm text-white placeholder:text-white/30 focus:outline-none"
            />
            <button
              type="submit"
              disabled={!inputValue.trim() || isThinking}
              className="text-sky-300 transition-opacity disabled:opacity-30"
              aria-label="Send"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
          <button
            type="button"
            onClick={handleMicToggle}
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition-colors ${
              voice.state === 'listening'
                ? 'border-sky-400/70 bg-sky-400/10 text-sky-300'
                : 'border-white/10 bg-white/[0.03] text-white/60 hover:text-sky-300'
            }`}
            aria-label="Toggle microphone"
          >
            {voice.state === 'listening' ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
          </button>
        </form>
      </div>
    </div>
  );
}
