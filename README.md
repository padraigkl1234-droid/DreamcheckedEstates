# JARVIS

A voice-operated AI fitness and diet coach. Talk to it; it builds your weekly training plan, knows what today's workout is, guides you through your session set by set, and coaches your nutrition as you log meals by voice.

## How it works

- **Voice in / voice out** — Web Speech API for speech recognition and synthesis (best in Chrome/Edge; text input always available as fallback).
- **AI coach** — Gemini 2.5 Flash via Genkit, with function-calling tools to update your plan, log meals, water, sets, and body metrics.
- **Your data stays on your device** — everything is stored in your browser's local storage and sent with each request; there is no server database.

## Run locally

```bash
npm install
echo 'GOOGLE_GENAI_API_KEY=your_key_here' > .env.local
npm run dev
```

Open http://localhost:3000. Get a free Gemini API key at https://aistudio.google.com/apikey.

## Deploy to Vercel

1. Import this repo at https://vercel.com/new
2. Add the `GOOGLE_GENAI_API_KEY` environment variable
3. Deploy — no other configuration needed
