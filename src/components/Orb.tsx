'use client';

import { useEffect, useRef } from 'react';

export type OrbState = 'idle' | 'listening' | 'speaking';

interface Particle {
  angle: number;
  baseRadius: number;
  speed: number;
  size: number;
  phase: number;
}

const BLUE_CORE = [4, 14, 34];
const BLUE_ACCENT = [56, 189, 248];
const GOLD_CORE = [44, 30, 4];
const GOLD_ACCENT = [251, 191, 36];

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpColor(c1: number[], c2: number[], t: number): string {
  return `rgb(${Math.round(lerp(c1[0], c2[0], t))}, ${Math.round(lerp(c1[1], c2[1], t))}, ${Math.round(lerp(c1[2], c2[2], t))})`;
}

export function Orb({
  state,
  amplitude,
  size = 280,
}: {
  state: OrbState;
  amplitude: number;
  size?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const colorMixRef = useRef(0);
  const ampSmoothRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const stateRef = useRef(state);
  const ampRef = useRef(amplitude);

  stateRef.current = state;
  ampRef.current = amplitude;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    if (particlesRef.current.length === 0) {
      const R = size / 2;
      particlesRef.current = Array.from({ length: 64 }, () => ({
        angle: Math.random() * Math.PI * 2,
        baseRadius: R * (0.12 + Math.random() * 0.74),
        speed: (Math.random() * 0.45 + 0.12) * (Math.random() < 0.5 ? 1 : -1),
        size: Math.random() * 1.7 + 0.6,
        phase: Math.random() * Math.PI * 2,
      }));
    }

    let last = performance.now();

    const tick = (t: number) => {
      const dt = Math.min((t - last) / 1000, 0.05);
      last = t;

      const targetMix = stateRef.current === 'speaking' ? 1 : 0;
      colorMixRef.current = lerp(colorMixRef.current, targetMix, 1 - Math.pow(0.0015, dt));

      const idleBreath = 0.08 + 0.05 * Math.sin((t / 1000) * 1.1);
      const targetAmp = stateRef.current === 'idle' ? idleBreath : ampRef.current;
      ampSmoothRef.current = lerp(ampSmoothRef.current, targetAmp, 1 - Math.pow(0.0008, dt));

      const mix = colorMixRef.current;
      const amp = ampSmoothRef.current;
      const core = lerpColor(BLUE_CORE, GOLD_CORE, mix);
      const accent = lerpColor(BLUE_ACCENT, GOLD_ACCENT, mix);
      const ar = Math.round(lerp(BLUE_ACCENT[0], GOLD_ACCENT[0], mix));
      const ag = Math.round(lerp(BLUE_ACCENT[1], GOLD_ACCENT[1], mix));
      const ab = Math.round(lerp(BLUE_ACCENT[2], GOLD_ACCENT[2], mix));
      const rgba = (a: number) => `rgba(${ar}, ${ag}, ${ab}, ${a})`;

      const R = size / 2;
      ctx.clearRect(0, 0, size, size);
      ctx.save();
      ctx.translate(R, R);

      for (let i = 0; i < 3; i++) {
        const ringR = R * (0.8 + i * 0.07) * (1 + amp * 0.05);
        ctx.beginPath();
        ctx.arc(0, 0, ringR, 0, Math.PI * 2);
        ctx.strokeStyle = accent;
        ctx.globalAlpha = (0.14 - i * 0.035) * (0.5 + amp);
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // Rotating outer tick ring — a slowly spinning ring of graduation marks.
      const tickCount = 60;
      const tickR = R * 0.965;
      const spin = (t / 1000) * 0.18;
      ctx.save();
      ctx.rotate(spin);
      for (let i = 0; i < tickCount; i++) {
        const a = (i / tickCount) * Math.PI * 2;
        const major = i % 5 === 0;
        const len = (major ? 8 : 4) * (1 + amp * 0.4);
        const x1 = Math.cos(a) * tickR;
        const y1 = Math.sin(a) * tickR;
        const x2 = Math.cos(a) * (tickR - len);
        const y2 = Math.sin(a) * (tickR - len);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = accent;
        ctx.globalAlpha = major ? 0.4 : 0.16;
        ctx.lineWidth = major ? 1.4 : 0.8;
        ctx.stroke();
      }
      ctx.restore();
      ctx.globalAlpha = 1;

      // Counter-rotating radar sweep — a soft trailing wedge of light.
      if (typeof ctx.createConicGradient === 'function') {
        const sweep = ctx.createConicGradient(-(t / 1000) * 0.9, 0, 0);
        sweep.addColorStop(0, rgba(0.16));
        sweep.addColorStop(0.08, rgba(0));
        sweep.addColorStop(1, rgba(0));
        ctx.beginPath();
        ctx.arc(0, 0, R * 0.9, 0, Math.PI * 2);
        ctx.fillStyle = sweep;
        ctx.globalAlpha = 0.6 + amp * 0.3;
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      const coreR = R * 0.9 * (1 + amp * 0.06);
      const gradient = ctx.createRadialGradient(0, 0, coreR * 0.05, 0, 0, coreR);
      gradient.addColorStop(0, accent);
      gradient.addColorStop(0.42, core);
      gradient.addColorStop(1, 'rgba(2,4,8,0.04)');
      ctx.beginPath();
      ctx.arc(0, 0, coreR, 0, Math.PI * 2);
      ctx.fillStyle = gradient;
      ctx.fill();

      ctx.save();
      ctx.beginPath();
      ctx.arc(0, 0, coreR, 0, Math.PI * 2);
      ctx.clip();

      for (const p of particlesRef.current) {
        p.angle += p.speed * dt * (1 + amp * 2.4);
        const wobble = Math.sin((t / 1000) * 1.3 + p.phase) * (4 + amp * 14);
        const r = p.baseRadius + wobble;
        ctx.beginPath();
        ctx.arc(Math.cos(p.angle) * r, Math.sin(p.angle) * r, p.size * (1 + amp * 0.9), 0, Math.PI * 2);
        ctx.fillStyle = accent;
        ctx.globalAlpha = 0.32 + amp * 0.45;
        ctx.shadowColor = accent;
        ctx.shadowBlur = 6;
        ctx.fill();
      }
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
      ctx.restore();

      ctx.beginPath();
      ctx.arc(0, 0, coreR, 0, Math.PI * 2);
      ctx.strokeStyle = accent;
      ctx.globalAlpha = 0.55 + amp * 0.35;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.globalAlpha = 1;

      ctx.restore();

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [size]);

  return <canvas ref={canvasRef} style={{ width: size, height: size }} className="block" />;
}
