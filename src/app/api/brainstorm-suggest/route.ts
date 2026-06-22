import { NextResponse } from 'next/server';
import { z } from 'genkit';
import { googleAI } from '@genkit-ai/google-genai';
import { ai } from '@/ai/genkit';

const SuggestionsSchema = z.object({
  suggestions: z
    .array(z.string().describe('A short, distinct follow-up idea, sub-question, or solution (2-8 words).'))
    .min(1)
    .max(6),
});

export async function POST(request: Request) {
  let topic: unknown;
  let path: unknown;
  let existing: unknown;
  try {
    const body = await request.json();
    topic = body.topic;
    path = body.path;
    existing = body.existing;
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  if (typeof topic !== 'string' || !topic.trim()) {
    return NextResponse.json({ error: 'A topic is required.' }, { status: 400 });
  }

  const breadcrumb = Array.isArray(path) && path.length > 0 ? path.join(' → ') : topic;
  const existingList = Array.isArray(existing) ? existing.filter((e): e is string => typeof e === 'string') : [];
  const avoidLine = existingList.length > 0 ? `Avoid repeating these existing ideas: ${existingList.join('; ')}.` : '';

  try {
    const response = await ai.generate({
      model: googleAI.model('gemini-2.5-flash'),
      prompt:
        `You are a creative brainstorming partner helping someone expand a mind map.\n` +
        `Root topic: "${topic}"\n` +
        `Current branch being expanded: "${breadcrumb}"\n` +
        `Suggest 5 short, distinct follow-up ideas, sub-questions, or solutions that branch off "${breadcrumb}". ${avoidLine}\n` +
        `Keep each suggestion concise (2-8 words) with no numbering or trailing punctuation.`,
      output: { schema: SuggestionsSchema },
    });

    const suggestions = response.output?.suggestions ?? [];
    if (suggestions.length === 0) {
      return NextResponse.json({ error: 'AI returned no usable suggestions.' }, { status: 502 });
    }
    return NextResponse.json({ suggestions });
  } catch (error) {
    console.error('Brainstorm AI suggest failed:', error);
    return NextResponse.json(
      { error: 'AI suggestions are unavailable. Check that GOOGLE_GENAI_API_KEY is configured.' },
      { status: 503 },
    );
  }
}
