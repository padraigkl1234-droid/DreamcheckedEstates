'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type VoiceState = 'idle' | 'listening' | 'speaking';

interface UseVoiceOptions {
  onFinalTranscript: (text: string) => void;
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

function getSpeechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === 'undefined') return null;
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export function useVoice({ onFinalTranscript }: UseVoiceOptions) {
  const [state, setState] = useState<VoiceState>('idle');
  const [amplitude, setAmplitude] = useState(0);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [sttSupported, setSttSupported] = useState(false);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const micRafRef = useRef<number | null>(null);
  const speakRafRef = useRef<number | null>(null);
  const speakSpikeRef = useRef(0);
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const onFinalTranscriptRef = useRef(onFinalTranscript);
  onFinalTranscriptRef.current = onFinalTranscript;

  useEffect(() => {
    setSttSupported(!!getSpeechRecognitionCtor());

    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

    // Pick ONE voice, once, and reuse it for every utterance so JARVIS never
    // changes voice mid-session. Voices load asynchronously in most browsers,
    // so resolve on the voiceschanged event and cache the result.
    const pickVoice = () => {
      if (voiceRef.current) return;
      const voices = window.speechSynthesis.getVoices();
      if (voices.length === 0) return;

      // Priority list of stable, known-good deep/neutral English voices.
      const byName = (needle: string) =>
        voices.find((v) => v.name.toLowerCase().includes(needle.toLowerCase()));
      const byLang = (re: RegExp) => voices.find((v) => re.test(v.lang));

      voiceRef.current =
        byName('Google UK English Male') ||
        byName('Daniel') ||
        byName('Microsoft Ryan') ||
        byName('Microsoft George') ||
        byName('Arthur') ||
        byName('Google UK English') ||
        byLang(/^en-GB/i) ||
        byName('Google US English') ||
        byLang(/^en-US/i) ||
        byLang(/^en/i) ||
        voices[0];
    };

    pickVoice();
    window.speechSynthesis.addEventListener('voiceschanged', pickVoice);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', pickVoice);
  }, []);

  const stopMicAnalysis = useCallback(() => {
    if (micRafRef.current) cancelAnimationFrame(micRafRef.current);
    micRafRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
  }, []);

  const startMicAnalysis = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.6;
      source.connect(analyser);

      const data = new Uint8Array(analyser.frequencyBinCount);
      const loop = () => {
        analyser.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i];
        setAmplitude(Math.min(1, (sum / data.length / 255) * 2.2));
        micRafRef.current = requestAnimationFrame(loop);
      };
      micRafRef.current = requestAnimationFrame(loop);
    } catch (err) {
      console.warn('JARVIS: mic amplitude analysis unavailable', err);
    }
  }, []);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        /* no-op */
      }
    }
  }, []);

  const startListening = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor || recognitionRef.current) return;

    const recognition = new Ctor();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event: any) => {
      let finalText = '';
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) finalText += result[0].transcript;
        else interim += result[0].transcript;
      }
      setInterimTranscript(interim);
      if (finalText.trim()) onFinalTranscriptRef.current(finalText.trim());
    };

    const reset = () => {
      recognitionRef.current = null;
      stopMicAnalysis();
      setState('idle');
      setAmplitude(0);
      setInterimTranscript('');
    };
    recognition.onerror = reset;
    recognition.onend = reset;

    recognitionRef.current = recognition;
    setState('listening');
    startMicAnalysis();
    recognition.start();
  }, [startMicAnalysis, stopMicAnalysis]);

  const stopSpeakAnalysis = useCallback(() => {
    if (speakRafRef.current) cancelAnimationFrame(speakRafRef.current);
    speakRafRef.current = null;
  }, []);

  const cancelSpeech = useCallback(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    stopSpeakAnalysis();
    setState('idle');
    setAmplitude(0);
  }, [stopSpeakAnalysis]);

  const speak = useCallback(
    (text: string) => {
      if (typeof window === 'undefined' || !('speechSynthesis' in window) || !text) return;

      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.02;
      utterance.pitch = 0.94;

      // Always use the single voice locked in at mount — never re-pick per call.
      if (voiceRef.current) {
        utterance.voice = voiceRef.current;
        utterance.lang = voiceRef.current.lang;
      }

      utterance.onstart = () => {
        setState('speaking');
        const start = performance.now();
        const loop = (t: number) => {
          const elapsed = (t - start) / 1000;
          speakSpikeRef.current = Math.max(0, speakSpikeRef.current - 0.045);
          const base = 0.18 + 0.12 * Math.sin(elapsed * 4.2);
          setAmplitude(Math.min(1, Math.max(0, base + speakSpikeRef.current)));
          speakRafRef.current = requestAnimationFrame(loop);
        };
        speakRafRef.current = requestAnimationFrame(loop);
      };

      // speechSynthesis exposes no audio buffer, so word boundaries stand in
      // for output amplitude spikes to keep the orb in sync with the voice.
      utterance.onboundary = () => {
        speakSpikeRef.current = 0.55 + Math.random() * 0.3;
      };

      const done = () => {
        stopSpeakAnalysis();
        setState('idle');
        setAmplitude(0);
      };
      utterance.onend = done;
      utterance.onerror = done;

      window.speechSynthesis.speak(utterance);
    },
    [stopSpeakAnalysis]
  );

  useEffect(() => {
    return () => {
      stopMicAnalysis();
      stopSpeakAnalysis();
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
    };
  }, [stopMicAnalysis, stopSpeakAnalysis]);

  return {
    state,
    amplitude,
    interimTranscript,
    sttSupported,
    startListening,
    stopListening,
    speak,
    cancelSpeech,
  };
}
