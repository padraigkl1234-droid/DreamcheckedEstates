// Fetches one stored photo on the browser's behalf, so a PDF export can embed
// it.
//
// Why this exists: putting a photo in a PDF means reading its BYTES, and a
// cross-origin fetch of those bytes is subject to CORS, where <img> is not.
// So a photo can display perfectly well on the page and still be unreadable
// to the exporter. Going through our own origin sidesteps the question
// entirely — server to server, CORS doesn't apply.
//
// This is deliberately NOT a general-purpose proxy. It will only fetch a
// Firebase Storage download URL, on the one host, for this project's one
// bucket, and only with the `alt=media` download token already in the URL —
// which is the same capability the caller needed to see the photo in the
// first place. Anything else is refused, so it can't be pointed at an
// internal address or used to launder requests to somewhere else.

import appletConfig from '../../../../firebase-applet-config.json';

export const runtime = 'nodejs';

const ALLOWED_HOST = 'firebasestorage.googleapis.com';
const BUCKET = appletConfig.storageBucket;

function allowed(raw: string): URL | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:') return null;
  if (u.hostname !== ALLOWED_HOST) return null;
  // /v0/b/<bucket>/o/<object>
  if (!u.pathname.startsWith(`/v0/b/${BUCKET}/o/`)) return null;
  if (u.searchParams.get('alt') !== 'media') return null;
  if (!u.searchParams.get('token')) return null;
  return u;
}

export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get('url');
  if (!raw) return new Response('Missing url', { status: 400 });

  const target = allowed(raw);
  if (!target) return new Response('Not a permitted photo URL', { status: 400 });

  let upstream: Response;
  try {
    upstream = await fetch(target.toString());
  } catch {
    return new Response('Upstream fetch failed', { status: 502 });
  }
  if (!upstream.ok || !upstream.body) {
    return new Response(`Upstream returned ${upstream.status}`, { status: 502 });
  }

  const type = upstream.headers.get('content-type') ?? 'application/octet-stream';
  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': type,
      // Per-user and short-lived: this is only ever read moments before a PDF
      // is written, and the bytes are the user's own photos.
      'Cache-Control': 'private, max-age=300',
    },
  });
}
