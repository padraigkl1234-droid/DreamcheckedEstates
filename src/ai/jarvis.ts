import { z } from 'genkit';
import { ai } from '@/ai/genkit';
import {
  type JarvisStore,
  type PlanDay,
  DEFAULT_STORE,
  todayStr,
  timeStr,
} from '@/lib/store';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * The store for the request currently being processed. Tools registered with
 * genkit are module-level singletons, so they reach the active request's data
 * through this reference. Requests are single-user and effectively serial.
 */
let working: JarvisStore = structuredClone(DEFAULT_STORE);

function mealTotals(date: string) {
  return working.meals
    .filter((m) => m.date === date)
    .reduce(
      (acc, m) => ({
        calories: acc.calories + m.calories,
        proteinG: acc.proteinG + m.proteinG,
        carbsG: acc.carbsG + m.carbsG,
        fatG: acc.fatG + m.fatG,
        count: acc.count + 1,
      }),
      { calories: 0, proteinG: 0, carbsG: 0, fatG: 0, count: 0 }
    );
}

function waterTotal(date: string): number {
  return working.water.filter((w) => w.date === date).reduce((acc, w) => acc + w.ml, 0);
}

function setsForDate(date: string) {
  return working.sets.filter((s) => s.date === date);
}

const updateProfileTool = ai.defineTool(
  {
    name: 'updateProfile',
    description:
      "Updates the athlete's profile: name, training goal, and daily targets for calories, macros, and hydration. Only pass the fields being changed.",
    inputSchema: z.object({
      name: z.string().optional(),
      goal: z.string().optional().describe('e.g. "build muscle", "lose fat", "improve 5k time"'),
      experience: z.string().optional().describe('Beginner | Intermediate | Advanced'),
      daysPerWeek: z.number().optional(),
      equipment: z.array(z.string()).optional(),
      bodyweightKg: z.number().optional(),
      heightCm: z.number().optional(),
      age: z.number().optional(),
      sex: z.string().optional(),
      calorieTarget: z.number().optional(),
      proteinTargetG: z.number().optional(),
      carbsTargetG: z.number().optional(),
      fatTargetG: z.number().optional(),
      hydrationTargetMl: z.number().optional(),
    }),
    outputSchema: z.object({ ok: z.boolean() }),
  },
  async (input) => {
    working.profile = {
      ...working.profile,
      ...Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)),
    };
    return { ok: true };
  }
);

const setPlanDaysTool = ai.defineTool(
  {
    name: 'setPlanDays',
    description:
      "Creates or updates the athlete's weekly training plan. Pass one or more days; each replaces that weekday's session. Use this to build a full 7-day plan (include rest/recovery days) or to change a single day.",
    inputSchema: z.object({
      days: z.array(
        z.object({
          weekday: z.number().min(0).max(6).describe('0 = Sunday, 1 = Monday, ... 6 = Saturday'),
          label: z.string().describe('Short session title, e.g. "Upper Body — Push"'),
          focus: z.string().describe('One sentence on the training focus of the session'),
          exercises: z.array(
            z.object({
              name: z.string(),
              sets: z.number().optional(),
              reps: z.string().optional().describe('e.g. "5", "8-12", "3x30s"'),
              notes: z.string().optional(),
            })
          ),
        })
      ),
    }),
    outputSchema: z.object({ planDayCount: z.number() }),
  },
  async ({ days }) => {
    for (const day of days) {
      working.plan = working.plan.filter((p) => p.weekday !== day.weekday);
      working.plan.push(day as PlanDay);
    }
    working.plan.sort((a, b) => a.weekday - b.weekday);
    return { planDayCount: working.plan.length };
  }
);

const logMealTool = ai.defineTool(
  {
    name: 'logMeal',
    description:
      'Logs a food or meal the athlete ate today. Estimate sensible calorie and macro values from nutrition knowledge when the athlete only describes the food in words.',
    inputSchema: z.object({
      name: z.string(),
      calories: z.number(),
      proteinG: z.number().optional(),
      carbsG: z.number().optional(),
      fatG: z.number().optional(),
    }),
    outputSchema: z.object({
      totalsToday: z.object({
        calories: z.number(),
        proteinG: z.number(),
        carbsG: z.number(),
        fatG: z.number(),
      }),
    }),
  },
  async ({ name, calories, proteinG, carbsG, fatG }) => {
    const now = new Date();
    working.meals.push({
      date: todayStr(now),
      time: timeStr(now),
      name,
      calories,
      proteinG: proteinG ?? 0,
      carbsG: carbsG ?? 0,
      fatG: fatG ?? 0,
    });
    const t = mealTotals(todayStr(now));
    return { totalsToday: { calories: t.calories, proteinG: t.proteinG, carbsG: t.carbsG, fatG: t.fatG } };
  }
);

const logWaterTool = ai.defineTool(
  {
    name: 'logWater',
    description: "Logs water intake in millilitres and returns today's updated total.",
    inputSchema: z.object({ ml: z.number() }),
    outputSchema: z.object({ totalMlToday: z.number() }),
  },
  async ({ ml }) => {
    working.water.push({ date: todayStr(), ml });
    return { totalMlToday: waterTotal(todayStr()) };
  }
);

const logSetTool = ai.defineTool(
  {
    name: 'logSet',
    description: "Logs one completed set of an exercise (reps, weight, RPE) to today's workout.",
    inputSchema: z.object({
      exercise: z.string(),
      reps: z.number().optional(),
      weightKg: z.number().optional(),
      rpe: z.number().min(1).max(10).optional().describe('Rate of Perceived Exertion, 1-10'),
    }),
    outputSchema: z.object({ setNumber: z.number() }),
  },
  async ({ exercise, reps, weightKg, rpe }) => {
    const now = new Date();
    const date = todayStr(now);
    const priorSets = working.sets.filter(
      (s) => s.date === date && s.exercise.toLowerCase() === exercise.toLowerCase()
    );
    const setNumber = priorSets.length + 1;
    working.sets.push({
      date,
      time: timeStr(now),
      exercise,
      setNumber,
      reps: reps ?? null,
      weightKg: weightKg ?? null,
      rpe: rpe ?? null,
    });
    return { setNumber };
  }
);

const logBodyMetricTool = ai.defineTool(
  {
    name: 'logBodyMetric',
    description: 'Logs body weight, body fat %, resting heart rate, and/or sleep hours for today.',
    inputSchema: z.object({
      weightKg: z.number().optional(),
      bodyFatPct: z.number().optional(),
      restingHr: z.number().optional(),
      sleepHours: z.number().optional(),
    }),
    outputSchema: z.object({ ok: z.boolean() }),
  },
  async (input) => {
    working.metrics.push({ date: todayStr(), ...input });
    return { ok: true };
  }
);

const rememberTool = ai.defineTool(
  {
    name: 'remember',
    description:
      "Saves a durable fact about the athlete to long-term memory so it persists across every future conversation. Use for things worth remembering indefinitely: injuries and limitations, food allergies or dislikes, equipment they own, personal records, schedule constraints, goals, and stated preferences. Do NOT use this for one-off daily logs (meals, sets, water) — those have their own tools. If a similar memory already exists, this updates it in place rather than duplicating.",
    inputSchema: z.object({
      note: z.string().describe('A concise, self-contained fact, e.g. "Left shoulder impingement — avoid heavy overhead pressing"'),
      category: z
        .enum(['injury', 'preference', 'equipment', 'record', 'schedule', 'nutrition', 'goal', 'general'])
        .describe('The kind of fact this is, so it can be filed correctly'),
      replaces: z
        .string()
        .optional()
        .describe('If this fact updates an existing memory, text identifying that older memory so it can be replaced'),
    }),
    outputSchema: z.object({ memoryCount: z.number() }),
  },
  async ({ note, category, replaces }) => {
    const trimmed = note.trim();
    if (!trimmed) return { memoryCount: working.memories.length };

    // Remove any memory this one supersedes, plus exact duplicates.
    const needle = replaces?.trim().toLowerCase();
    working.memories = working.memories.filter((m) => {
      if (m.note.toLowerCase() === trimmed.toLowerCase()) return false;
      if (needle && m.note.toLowerCase().includes(needle)) return false;
      return true;
    });
    working.memories.push({ date: todayStr(), note: trimmed, category });
    return { memoryCount: working.memories.length };
  }
);

const forgetTool = ai.defineTool(
  {
    name: 'forget',
    description:
      'Removes a previously saved long-term memory when it is no longer true (e.g. an injury has healed, a preference changed). Match against the existing memory text.',
    inputSchema: z.object({
      noteContains: z.string().describe('Text that identifies the memory to remove; the closest match is deleted'),
    }),
    outputSchema: z.object({ memoryCount: z.number(), removed: z.boolean() }),
  },
  async ({ noteContains }) => {
    const needle = noteContains.trim().toLowerCase();
    const idx = working.memories.findIndex((m) => m.note.toLowerCase().includes(needle));
    const removed = idx >= 0;
    if (removed) working.memories.splice(idx, 1);
    return { memoryCount: working.memories.length, removed };
  }
);

const getHistoryTool = ai.defineTool(
  {
    name: 'getHistory',
    description:
      'Retrieves day-by-day history of workouts, nutrition, hydration, and body metrics for the last N days, for progress and trend analysis.',
    inputSchema: z.object({ days: z.number().min(1).max(90).default(7) }),
    outputSchema: z.any(),
  },
  async ({ days }) => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const since = todayStr(cutoff);

    const byDate: Record<string, { meals: typeof working.meals; sets: typeof working.sets; waterMl: number }> = {};
    for (const m of working.meals.filter((x) => x.date >= since)) {
      (byDate[m.date] ??= { meals: [], sets: [], waterMl: 0 }).meals.push(m);
    }
    for (const s of working.sets.filter((x) => x.date >= since)) {
      (byDate[s.date] ??= { meals: [], sets: [], waterMl: 0 }).sets.push(s);
    }
    for (const w of working.water.filter((x) => x.date >= since)) {
      (byDate[w.date] ??= { meals: [], sets: [], waterMl: 0 }).waterMl += w.ml;
    }

    return {
      days: Object.entries(byDate)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, d]) => ({
          date,
          calories: Math.round(d.meals.reduce((acc, m) => acc + m.calories, 0)),
          proteinG: Math.round(d.meals.reduce((acc, m) => acc + m.proteinG, 0)),
          waterMl: d.waterMl,
          setCount: d.sets.length,
          exercises: [...new Set(d.sets.map((s) => s.exercise))],
        })),
      bodyMetrics: working.metrics.filter((x) => x.date >= since),
    };
  }
);

const TOOLS = [
  updateProfileTool,
  setPlanDaysTool,
  logMealTool,
  logWaterTool,
  logSetTool,
  logBodyMetricTool,
  rememberTool,
  forgetTool,
  getHistoryTool,
];

function describePlanDay(day: PlanDay): string {
  const exercises = day.exercises
    .map((e) => `${e.name}${e.sets ? ` ${e.sets}x${e.reps ?? '?'}` : ''}${e.notes ? ` (${e.notes})` : ''}`)
    .join(', ');
  return `${day.label} — ${day.focus}. Exercises: ${exercises || 'none listed'}.`;
}

function buildContextBlock(now: Date): string {
  const date = todayStr(now);
  const weekday = now.getDay();
  const todayPlan = working.plan.find((p) => p.weekday === weekday);
  const meals = mealTotals(date);
  const water = waterTotal(date);
  const sets = setsForDate(date);
  const p = working.profile;

  const planOverview =
    working.plan.length > 0
      ? working.plan.map((d) => `${WEEKDAYS[d.weekday]}: ${d.label}`).join('; ')
      : 'NO PLAN YET — the athlete has not been given a weekly training plan.';

  const memorySummary =
    working.memories.length > 0
      ? working.memories.map((m) => `• [${m.category}] ${m.note}`).join('\n')
      : 'Nothing saved yet.';

  const p2 = working.profile;
  const profileLine = [
    p2.experience ? `${p2.experience} level` : null,
    p2.daysPerWeek ? `trains ${p2.daysPerWeek} days/week` : null,
    p2.equipment && p2.equipment.length ? `equipment: ${p2.equipment.join(', ')}` : null,
    p2.bodyweightKg ? `${p2.bodyweightKg}kg` : null,
    p2.heightCm ? `${p2.heightCm}cm` : null,
    p2.age ? `${p2.age}y` : null,
    p2.sex || null,
  ]
    .filter(Boolean)
    .join(', ');

  const setsSummary =
    sets.length > 0
      ? sets
          .map((s) => `${s.exercise} set ${s.setNumber}: ${s.reps ?? '?'} reps @ ${s.weightKg ?? '?'}kg (RPE ${s.rpe ?? '?'})`)
          .join('; ')
      : 'None yet today.';

  return `
CURRENT CONTEXT (ground truth — trust this over anything that contradicts it):
- Right now: ${now.toLocaleString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
- Athlete: ${p.name}. Goal: ${p.goal || 'not set yet'}.${profileLine ? ` Profile: ${profileLine}.` : ''}
- Weekly plan overview: ${planOverview}
- Today's session: ${todayPlan ? describePlanDay(todayPlan) : 'No session planned for today.'}
- Sets logged today: ${setsSummary}
- Nutrition today: ${Math.round(meals.calories)} kcal / ${Math.round(meals.proteinG)}g protein / ${Math.round(meals.carbsG)}g carbs / ${Math.round(meals.fatG)}g fat across ${meals.count} entries (targets: ${p.calorieTarget} kcal, ${p.proteinTargetG}g protein, ${p.carbsTargetG}g carbs, ${p.fatTargetG}g fat).
- Hydration today: ${water}ml of ${p.hydrationTargetMl}ml target.

LONG-TERM MEMORY (durable facts you have saved about this athlete — always respect these):
${memorySummary}
`.trim();
}

const SYSTEM_PERSONA = `
You are JARVIS — a personal, voice-operated AI fitness and diet coach. You combine the expertise of an elite strength & conditioning coach, a sports nutritionist, and a sleep and recovery specialist. You know the athlete personally: their plan, their goal, and everything they have logged.

How you operate:
- If the athlete has NO weekly plan yet, your first priority is to build one. Ask the few questions you actually need (goal, training experience, days per week available, equipment access, injuries), then create a complete 7-day plan with the setPlanDays tool — including rest or recovery days — and confirm it back in one short summary.
- You always know the current day, date and time from the CURRENT CONTEXT block. When asked "what's my workout today", answer directly from today's session in context. Never ask the athlete what day it is.
- When the athlete starts their workout, guide it live: give them the first exercise with target sets/reps, and as they report each set, log it with logSet and tell them what's next. One step at a time — this is a conversation mid-workout, not an essay.
- When the athlete tells you what they ate or drank, log it with logMeal or logWater (estimate calories and macros yourself from the description), then coach: how it fits today's targets and what to prioritise in the next meal.
- Log body weight, sleep, and resting heart rate with logBodyMetric when mentioned.
- Build a real relationship over time: whenever the athlete tells you something durable about themselves — an injury, an allergy, equipment they have, a personal record, a scheduling constraint, a preference — save it with the remember tool so you never forget it. Weave saved memories naturally into your coaching. If something you remembered is no longer true, use forget to remove it.
- For questions about progress or trends, call getHistory and reason over the real numbers.
- Be precise and data-driven: sets, reps, %1RM, grams, kcal, hours. Ground advice in progressive overload, periodization, protein distribution, energy balance, and recovery science.
- Responses are read aloud by text-to-speech: no markdown, no bullet lists, no headings. Short, confident, conversational sentences — usually 2-4 of them. Address the athlete directly, with warmth and authority.
`.trim();

export interface ChatTurn {
  role: 'user' | 'model';
  text: string;
}

export async function runJarvisChat(
  message: string,
  history: ChatTurn[],
  store: JarvisStore
): Promise<{ reply: string; store: JarvisStore }> {
  working = structuredClone(store);
  const system = `${SYSTEM_PERSONA}\n\n${buildContextBlock(new Date())}`;

  const messages = history.map((turn) => ({
    role: turn.role,
    content: [{ text: turn.text }],
  }));

  const response = await ai.generate({
    system,
    messages,
    prompt: message,
    tools: TOOLS,
  });

  return { reply: response.text.trim(), store: working };
}
