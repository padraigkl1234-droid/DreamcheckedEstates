'use client';

import { HudFrame, HudSection, HudBar } from '@/components/HudFrame';
import { type JarvisStore, todayStr } from '@/lib/store';

export function NutritionHud({ store, onClose }: { store: JarvisStore; onClose?: () => void }) {
  const today = todayStr();
  const meals = store.meals.filter((m) => m.date === today);
  const water = store.water.filter((w) => w.date === today).reduce((a, w) => a + w.ml, 0);
  const totals = meals.reduce(
    (acc, m) => ({
      calories: acc.calories + m.calories,
      proteinG: acc.proteinG + m.proteinG,
      carbsG: acc.carbsG + m.carbsG,
      fatG: acc.fatG + m.fatG,
    }),
    { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 }
  );
  const p = store.profile;

  return (
    <HudFrame title="Food Diary" side="right" accent="amber" onClose={onClose}>
      {/* Macro targets */}
      <HudSection label="Today's Intake">
        <HudBar label="Energy" value={totals.calories} target={p.calorieTarget} unit="" accent="amber" />
        <HudBar label="Protein" value={totals.proteinG} target={p.proteinTargetG} unit="g" accent="violet" />
        <HudBar label="Carbs" value={totals.carbsG} target={p.carbsTargetG} unit="g" accent="sky" />
        <HudBar label="Fat" value={totals.fatG} target={p.fatTargetG} unit="g" accent="emerald" />
        <div className="mt-3">
          <HudBar label="Hydration" value={water} target={p.hydrationTargetMl} unit="ml" accent="sky" />
        </div>
      </HudSection>

      {/* Meal log */}
      <HudSection label={`Meals · ${meals.length}`}>
        {meals.length > 0 ? (
          <div className="space-y-2">
            {meals.map((m, i) => (
              <div key={i} className="border-l border-amber-400/25 pl-2">
                <div className="flex items-baseline justify-between">
                  <span className="text-[12px] text-white/80">{m.name}</span>
                  <span className="font-display text-[10px] tabular-nums text-white/30">{m.time}</span>
                </div>
                <div className="flex gap-2 text-[10px] tabular-nums text-white/45">
                  <span className="text-amber-200/70">{Math.round(m.calories)} kcal</span>
                  <span>P{Math.round(m.proteinG)}</span>
                  <span>C{Math.round(m.carbsG)}</span>
                  <span>F{Math.round(m.fatG)}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-[12px] italic text-white/35">
            No meals logged. Tell JARVIS what you eat and it&rsquo;ll track it.
          </div>
        )}
      </HudSection>

      {/* Remaining readout */}
      <HudSection label="Remaining">
        <div className="grid grid-cols-2 gap-2 text-center">
          <div className="rounded border border-white/10 bg-white/[0.02] py-2">
            <div className="font-display text-lg tabular-nums text-amber-200">
              {Math.max(0, Math.round(p.calorieTarget - totals.calories))}
            </div>
            <div className="text-[9px] uppercase tracking-widest text-white/35">kcal left</div>
          </div>
          <div className="rounded border border-white/10 bg-white/[0.02] py-2">
            <div className="font-display text-lg tabular-nums text-violet-200">
              {Math.max(0, Math.round(p.proteinTargetG - totals.proteinG))}
            </div>
            <div className="text-[9px] uppercase tracking-widest text-white/35">g protein</div>
          </div>
        </div>
      </HudSection>
    </HudFrame>
  );
}
