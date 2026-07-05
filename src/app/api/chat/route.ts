import { NextRequest, NextResponse } from 'next/server';
import { runJarvisChat, type ChatTurn } from '@/ai/jarvis';
import { DEFAULT_STORE, type JarvisStore } from '@/lib/store';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const message: string = typeof body.message === 'string' ? body.message.trim() : '';
    const history: ChatTurn[] = Array.isArray(body.history) ? body.history : [];
    const store: JarvisStore =
      body.store && typeof body.store === 'object'
        ? { ...structuredClone(DEFAULT_STORE), ...body.store }
        : structuredClone(DEFAULT_STORE);

    if (!message) {
      return NextResponse.json({ error: 'message is required' }, { status: 400 });
    }

    const result = await runJarvisChat(message, history.slice(-16), store);
    return NextResponse.json(result);
  } catch (err) {
    console.error('JARVIS chat error:', err);
    return NextResponse.json(
      { error: 'JARVIS hit a problem processing that request.' },
      { status: 500 }
    );
  }
}
