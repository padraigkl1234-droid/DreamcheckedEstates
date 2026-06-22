import { NextRequest, NextResponse } from 'next/server';
import { runInvictusCoachChat, type ChatTurn } from '@/ai/flows/invictus-coach';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const message: string = typeof body.message === 'string' ? body.message.trim() : '';
    const history: ChatTurn[] = Array.isArray(body.history) ? body.history : [];

    if (!message) {
      return NextResponse.json({ error: 'message is required' }, { status: 400 });
    }

    const reply = await runInvictusCoachChat(message, history.slice(-16));
    return NextResponse.json({ reply });
  } catch (err) {
    console.error('INVICTUS chat error:', err);
    return NextResponse.json(
      { error: 'INVICTUS encountered an error processing that request.' },
      { status: 500 }
    );
  }
}
