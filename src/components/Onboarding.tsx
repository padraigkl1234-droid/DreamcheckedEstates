'use client';

import React, { useState } from 'react';
import {
  type JarvisStore,
  type Profile,
  type MemoryEntry,
  type MemoryCategory,
  computeTargets,
  todayStr,
} from '@/lib/store';
import { Chip, Field, inputClass as numberInput, GOALS, LEVELS, DAYS, EQUIPMENT, SEXES } from '@/components/formBits';

function splitItems(text: string): string[] {
  return text
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function Onboarding({ onComplete }: { onComplete: (patch: Partial<JarvisStore>) => void }) {
  const [name, setName] = useState('');
  const [sex, setSex] = useState<string>('');
  const [age, setAge] = useState('');
  const [heightCm, setHeightCm] = useState('');
  const [bodyweightKg, setBodyweightKg] = useState('');
  const [goal, setGoal] = useState('');
  const [experience, setExperience] = useState('');
  const [daysPerWeek, setDaysPerWeek] = useState<number | null>(null);
  const [equipment, setEquipment] = useState<string[]>([]);
  const [injuries, setInjuries] = useState('');
  const [dietary, setDietary] = useState('');

  const toggleEquip = (e: string) =>
    setEquipment((cur) => (cur.includes(e) ? cur.filter((x) => x !== e) : [...cur, e]));

  const ready = name.trim().length > 0 && goal.length > 0;

  const submit = () => {
    if (!ready) return;

    const num = (s: string) => {
      const n = parseFloat(s);
      return Number.isFinite(n) ? n : undefined;
    };

    const input = {
      name: name.trim(),
      goal,
      experience: experience || undefined,
      daysPerWeek: daysPerWeek ?? undefined,
      equipment: equipment.length ? equipment : undefined,
      bodyweightKg: num(bodyweightKg),
      heightCm: num(heightCm),
      age: num(age),
      sex: sex || undefined,
    };

    const profile: Partial<Profile> = {
      ...input,
      onboarded: true,
      ...computeTargets(input),
    };

    const now = todayStr();
    const mem = (note: string, category: MemoryCategory): MemoryEntry => ({ date: now, note, category });
    const memories: MemoryEntry[] = [mem(`Primary goal: ${goal}`, 'goal')];
    if (experience) memories.push(mem(`Training experience: ${experience}`, 'general'));
    if (daysPerWeek) memories.push(mem(`Available to train ${daysPerWeek} days per week`, 'schedule'));
    if (equipment.length) memories.push(mem(`Trains with: ${equipment.join(', ')}`, 'equipment'));
    for (const item of splitItems(injuries)) memories.push(mem(item, 'injury'));
    for (const item of splitItems(dietary)) memories.push(mem(item, 'nutrition'));

    onComplete({ profile: profile as Profile, memories });
  };

  return (
    <div className="relative flex h-[100dvh] w-full items-center justify-center overflow-y-auto bg-black px-4 py-10 font-sans">
      <div className="pointer-events-none absolute inset-0 hud-grid" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(56,189,248,0.08),transparent_62%)]" />
      <div className="pointer-events-none absolute inset-0 z-40 hud-scanlines opacity-50" />

      <div
        className="relative z-10 w-full max-w-lg rounded-lg border border-sky-400/25 bg-black/50 p-6 backdrop-blur-md sm:p-8"
        style={{ boxShadow: 'inset 0 0 60px rgba(0,0,0,0.6), 0 0 40px rgba(56,189,248,0.06)' }}
      >
        <span className="pointer-events-none absolute left-0 top-0 h-5 w-5 border-l-2 border-t-2 border-sky-400/60" />
        <span className="pointer-events-none absolute right-0 top-0 h-5 w-5 border-r-2 border-t-2 border-sky-400/60" />
        <span className="pointer-events-none absolute bottom-0 left-0 h-5 w-5 border-b-2 border-l-2 border-sky-400/60" />
        <span className="pointer-events-none absolute bottom-0 right-0 h-5 w-5 border-b-2 border-r-2 border-sky-400/60" />

        <div className="mb-6 text-center">
          <div className="font-display text-xl tracking-[0.4em] text-white [text-shadow:0_0_14px_rgba(56,189,248,0.5)]">
            JARVIS
          </div>
          <div className="mt-1 font-display text-[10px] uppercase tracking-[0.3em] text-sky-300/70">
            Athlete Profile · Initialisation
          </div>
        </div>

        <div className="space-y-5">
          <Field label="Call sign / Name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="What should JARVIS call you?"
              className={numberInput}
            />
          </Field>

          <Field label="Primary goal">
            <div className="flex flex-wrap gap-2">
              {GOALS.map((g) => (
                <Chip key={g} active={goal === g} onClick={() => setGoal(g)}>
                  {g}
                </Chip>
              ))}
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Experience">
              <div className="flex flex-wrap gap-2">
                {LEVELS.map((l) => (
                  <Chip key={l} active={experience === l} onClick={() => setExperience(l)}>
                    {l}
                  </Chip>
                ))}
              </div>
            </Field>
            <Field label="Days / week">
              <div className="flex flex-wrap gap-2">
                {DAYS.map((d) => (
                  <Chip key={d} active={daysPerWeek === d} onClick={() => setDaysPerWeek(d)}>
                    {d}
                  </Chip>
                ))}
              </div>
            </Field>
          </div>

          <Field label="Equipment access">
            <div className="flex flex-wrap gap-2">
              {EQUIPMENT.map((e) => (
                <Chip key={e} active={equipment.includes(e)} onClick={() => toggleEquip(e)}>
                  {e}
                </Chip>
              ))}
            </div>
          </Field>

          <Field label="Body stats (optional — sharpens your targets)">
            <div className="grid grid-cols-3 gap-2">
              <input value={age} onChange={(e) => setAge(e.target.value)} inputMode="numeric" placeholder="Age" className={numberInput} />
              <input value={heightCm} onChange={(e) => setHeightCm(e.target.value)} inputMode="numeric" placeholder="Height cm" className={numberInput} />
              <input value={bodyweightKg} onChange={(e) => setBodyweightKg(e.target.value)} inputMode="numeric" placeholder="Weight kg" className={numberInput} />
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {SEXES.map((s) => (
                <Chip key={s} active={sex === s} onClick={() => setSex(s)}>
                  {s}
                </Chip>
              ))}
            </div>
          </Field>

          <Field label="Injuries / limitations (optional)">
            <textarea
              value={injuries}
              onChange={(e) => setInjuries(e.target.value)}
              placeholder="e.g. Left knee — avoid deep loaded flexion; dodgy lower back"
              rows={2}
              className={`${numberInput} resize-none`}
            />
          </Field>

          <Field label="Dietary notes / allergies (optional)">
            <textarea
              value={dietary}
              onChange={(e) => setDietary(e.target.value)}
              placeholder="e.g. Vegetarian; lactose intolerant; hate seafood"
              rows={2}
              className={`${numberInput} resize-none`}
            />
          </Field>

          <button
            type="button"
            onClick={submit}
            disabled={!ready}
            className={`w-full rounded-md border py-3 font-display text-xs uppercase tracking-[0.3em] transition-all ${
              ready
                ? 'border-sky-400/60 bg-sky-400/15 text-sky-200 shadow-[0_0_20px_rgba(56,189,248,0.3)] hover:bg-sky-400/25'
                : 'cursor-not-allowed border-white/10 bg-white/[0.02] text-white/25'
            }`}
          >
            Initialise JARVIS ▸
          </button>
          <p className="text-center text-[10px] text-white/30">
            Everything stays on this device. You can refine any of it later just by talking to JARVIS.
          </p>
        </div>
      </div>
    </div>
  );
}
