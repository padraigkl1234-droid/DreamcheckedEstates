'use client';

import { HudFrame, HudSection } from '@/components/HudFrame';
import { type JarvisStore, MEMORY_META, todayStr } from '@/lib/store';

const WEEKDAYS_SHORT = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function TrainingHud({ store, onClose }: { store: JarvisStore; onClose?: () => void }) {
  const now = new Date();
  const weekday = now.getDay();
  const today = todayStr(now);
  const todayPlan = store.plan.find((p) => p.weekday === weekday);
  const todaySets = store.sets.filter((s) => s.date === today);
  const plannedWeekdays = new Set(store.plan.map((p) => p.weekday));

  return (
    <HudFrame title="Training Log" side="left" accent="sky" onClose={onClose}>
      {/* Week strip */}
      <HudSection label="Week Cycle">
        <div className="flex justify-between">
          {WEEKDAYS_SHORT.map((d, i) => {
            const isToday = i === weekday;
            const planned = plannedWeekdays.has(i);
            return (
              <div key={i} className="flex flex-col items-center gap-1">
                <span className={`text-[10px] ${isToday ? 'text-sky-300' : 'text-white/40'}`}>{d}</span>
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    isToday
                      ? 'bg-sky-400 shadow-[0_0_6px_rgba(56,189,248,0.9)]'
                      : planned
                      ? 'bg-white/40'
                      : 'bg-white/10'
                  }`}
                />
              </div>
            );
          })}
        </div>
      </HudSection>

      {/* Today's session */}
      <HudSection label={`Today · ${WEEKDAYS[weekday]}`}>
        {todayPlan ? (
          <div>
            <div className="mb-1 font-display text-sm text-sky-200">{todayPlan.label}</div>
            <div className="mb-3 text-[11px] leading-relaxed text-white/50">{todayPlan.focus}</div>
            <div className="space-y-1.5">
              {todayPlan.exercises.map((ex, i) => {
                const done = todaySets.some((s) => s.exercise.toLowerCase() === ex.name.toLowerCase());
                return (
                  <div key={i} className="flex items-center gap-2 text-[12px]">
                    <span
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border text-[9px] ${
                        done ? 'border-sky-400/60 bg-sky-400/15 text-sky-300' : 'border-white/15 text-transparent'
                      }`}
                    >
                      ✓
                    </span>
                    <span className={done ? 'text-white/85' : 'text-white/65'}>{ex.name}</span>
                    {(ex.sets || ex.reps) && (
                      <span className="ml-auto font-display text-[10px] tabular-nums text-white/35">
                        {ex.sets ?? ''}
                        {ex.sets && ex.reps ? '×' : ''}
                        {ex.reps ?? ''}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="text-[12px] italic text-white/35">
            {store.plan.length === 0
              ? 'No plan yet. Ask JARVIS to build one.'
              : 'Rest day — no session scheduled.'}
          </div>
        )}
      </HudSection>

      {/* Sets logged today */}
      <HudSection label={`Sets Logged · ${todaySets.length}`}>
        {todaySets.length > 0 ? (
          <div className="space-y-1">
            {todaySets.map((s, i) => (
              <div key={i} className="flex items-baseline gap-2 text-[11px]">
                <span className="font-display text-white/30">{s.time}</span>
                <span className="text-white/75">{s.exercise}</span>
                <span className="ml-auto font-display tabular-nums text-sky-200/80">
                  {s.reps ?? '–'}×{s.weightKg ?? '–'}kg
                  {s.rpe ? <span className="text-white/30"> @{s.rpe}</span> : null}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-[12px] italic text-white/35">Nothing logged yet today.</div>
        )}
      </HudSection>

      {/* Memory bank — grouped by category, injuries surfaced first */}
      <HudSection label={`Memory Bank · ${store.memories.length}`}>
        {store.memories.length > 0 ? (
          <div className="space-y-1.5">
            {[...store.memories]
              .sort((a, b) => {
                // Injuries and records float to the top; otherwise newest-first.
                const rank = (c: string) => (c === 'injury' ? 0 : c === 'record' ? 1 : 2);
                return rank(a.category) - rank(b.category);
              })
              .map((m, i) => {
                const meta = MEMORY_META[m.category] ?? MEMORY_META.general;
                const isWarn = m.category === 'injury';
                return (
                  <div key={i} className="flex gap-1.5 text-[11px] leading-snug">
                    <span
                      className={isWarn ? 'text-amber-400/80' : 'text-sky-400/60'}
                      title={meta.label}
                    >
                      {meta.glyph}
                    </span>
                    <span className={isWarn ? 'text-amber-100/80' : 'text-white/60'}>{m.note}</span>
                  </div>
                );
              })}
          </div>
        ) : (
          <div className="text-[12px] italic text-white/35">
            Tell JARVIS about yourself — injuries, PRs, preferences — and it&rsquo;ll remember.
          </div>
        )}
      </HudSection>
    </HudFrame>
  );
}
