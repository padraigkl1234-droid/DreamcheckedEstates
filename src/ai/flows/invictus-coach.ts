import { z } from 'genkit';
import { ai } from '@/ai/genkit';
import {
  getSettings,
  getSplitDay,
  getNutritionTotals,
  getHydrationTotal,
  getWorkoutSessionForDate,
  logHydration,
  logNutrition,
  logWorkoutSet,
  logBodyMetric,
  setSplitDay,
  getProgressSummary,
  todayStr,
} from '@/lib/invictus-coach/repo';

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const logHydrationTool = ai.defineTool(
  {
    name: 'logHydration',
    description: "Logs water intake in millilitres for today and returns the athlete's updated daily hydration total.",
    inputSchema: z.object({ amountMl: z.number().describe('Amount of water consumed, in millilitres') }),
    outputSchema: z.object({ totalMlToday: z.number() }),
  },
  async ({ amountMl }) => {
    logHydration(amountMl);
    return { totalMlToday: getHydrationTotal(todayStr()) };
  }
);

const logFoodTool = ai.defineTool(
  {
    name: 'logFood',
    description:
      'Logs a food or meal entry with its macros for today. Estimate reasonable macro values from food science knowledge if the athlete does not provide exact numbers.',
    inputSchema: z.object({
      foodName: z.string(),
      calories: z.number(),
      proteinG: z.number().optional(),
      carbsG: z.number().optional(),
      fatG: z.number().optional(),
    }),
    outputSchema: z.object({
      totalsToday: z.object({ calories: z.number(), proteinG: z.number(), carbsG: z.number(), fatG: z.number() }),
    }),
  },
  async ({ foodName, calories, proteinG, carbsG, fatG }) => {
    logNutrition({ foodName, calories, proteinG, carbsG, fatG });
    const totals = getNutritionTotals(todayStr());
    return { totalsToday: { calories: totals.calories, proteinG: totals.proteinG, carbsG: totals.carbsG, fatG: totals.fatG } };
  }
);

const logWorkoutSetTool = ai.defineTool(
  {
    name: 'logWorkoutSet',
    description: "Logs a single completed set of an exercise (reps, weight, RPE) to today's gym session.",
    inputSchema: z.object({
      exerciseName: z.string(),
      reps: z.number().optional(),
      weightKg: z.number().optional(),
      rpe: z.number().min(1).max(10).optional().describe('Rate of Perceived Exertion, 1-10'),
    }),
    outputSchema: z.object({ setNumber: z.number() }),
  },
  async ({ exerciseName, reps, weightKg, rpe }) => {
    const result = logWorkoutSet({
      exerciseName,
      reps: reps ?? null,
      weightKg: weightKg ?? null,
      rpe: rpe ?? null,
    });
    return { setNumber: result.setNumber };
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
  async (params) => {
    logBodyMetric(params);
    return { ok: true };
  }
);

const setWorkoutSplitDayTool = ai.defineTool(
  {
    name: 'setWorkoutSplitDay',
    description: "Updates the athlete's weekly training split for a given day of the week.",
    inputSchema: z.object({
      weekday: z.number().min(0).max(6).describe('0 = Sunday, 1 = Monday, ... 6 = Saturday'),
      label: z.string().describe('Short session title, e.g. "Upper Body — Push Strength"'),
      focus: z.string().describe('One-sentence description of the training focus'),
      exercises: z.array(z.string()).describe('Primary exercises for the session'),
    }),
    outputSchema: z.object({ ok: z.boolean() }),
  },
  async ({ weekday, label, focus, exercises }) => {
    setSplitDay(weekday, label, focus, exercises);
    return { ok: true };
  }
);

const getProgressSummaryTool = ai.defineTool(
  {
    name: 'getProgressSummary',
    description: 'Retrieves historical nutrition, hydration, workout session, and body metric data for trend analysis.',
    inputSchema: z.object({ days: z.number().min(1).max(90).default(7) }),
    outputSchema: z.any(),
  },
  async ({ days }) => getProgressSummary(days)
);

const TOOLS = [logHydrationTool, logFoodTool, logWorkoutSetTool, logBodyMetricTool, setWorkoutSplitDayTool, getProgressSummaryTool];

function buildContextBlock(now: Date): string {
  const weekday = now.getDay();
  const dateStr = todayStr(now);
  const split = getSplitDay(weekday);
  const settings = getSettings();
  const nutritionTotals = getNutritionTotals(dateStr);
  const hydrationTotal = getHydrationTotal(dateStr);
  const session = getWorkoutSessionForDate(dateStr);

  const setsSummary =
    session && session.sets.length > 0
      ? session.sets.map((s) => `${s.exerciseName} set ${s.setNumber}: ${s.reps ?? '?'} reps @ ${s.weightKg ?? '?'}kg (RPE ${s.rpe ?? '?'})`).join('; ')
      : 'No sets logged yet today.';

  return `
CURRENT CONTEXT (ground truth — trust this over anything the athlete claims that contradicts it):
- Right now: ${now.toLocaleString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
- Today's scheduled training: ${split ? `${split.label} — ${split.focus}. Suggested exercises: ${split.exercises.join(', ')}.` : 'No split configured for today.'}
- Sets logged so far today: ${setsSummary}
- Nutrition today: ${Math.round(nutritionTotals.calories)} kcal / ${Math.round(nutritionTotals.proteinG)}g protein / ${Math.round(nutritionTotals.carbsG)}g carbs / ${Math.round(nutritionTotals.fatG)}g fat logged across ${nutritionTotals.entryCount} entries (targets: ${settings.daily_calorie_target} kcal, ${settings.daily_protein_target_g}g protein, ${settings.daily_carbs_target_g}g carbs, ${settings.daily_fat_target_g}g fat).
- Hydration today: ${Math.round(hydrationTotal)}ml logged (target ${settings.daily_hydration_target_ml}ml).
- Athlete display name: ${settings.display_name}.
`.trim();
}

const SYSTEM_PERSONA = `
You are INVICTUS — an elite, ultra-intelligent voice-activated health, fitness, and athletic performance coach, in the spirit of a JARVIS-style AI assistant. You combine the expertise of a world-class sports scientist, elite strength & conditioning coach, registered sports nutritionist, and sleep scientist.

Rules:
- Every claim must be rooted in precise, data-driven athletic development principles (progressive overload, periodization, protein timing/leucine threshold, sleep architecture, RPE-based autoregulation, energy balance, etc.). Be specific with numbers (sets, reps, %1RM, grams, kcal, hours) wherever useful.
- You ALWAYS know the current day, date and time from the CURRENT CONTEXT block below — use it. If asked "what's my workout today", answer directly from the scheduled training in context, do not ask the athlete to remind you.
- When the athlete tells you about food eaten, water drunk, sets/reps/weight lifted, or body metrics (weight, sleep, resting HR), call the matching tool to log it to their persistent record. Estimate reasonable macro values yourself if they only describe the food in words.
- When asked about progress over time, call getProgressSummary and reason over the real numbers it returns.
- Keep responses concise and conversational — they will be read aloud by text-to-speech. Avoid markdown, bullet symbols, or long lists; speak in short, confident sentences like a coach standing next to the athlete. 2-4 sentences is usually right unless the athlete asks for a detailed breakdown.
- Address the athlete directly and with authority, but stay encouraging.
`.trim();

export interface ChatTurn {
  role: 'user' | 'model';
  text: string;
}

export async function runInvictusCoachChat(message: string, history: ChatTurn[] = []): Promise<string> {
  const now = new Date();
  const system = `${SYSTEM_PERSONA}\n\n${buildContextBlock(now)}`;

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

  return response.text.trim();
}
