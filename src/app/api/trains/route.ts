import { NextResponse } from 'next/server';

export const revalidate = 60;

// Live arrivals into Margate for the Event Mode page, via Rail Delivery
// Group's "Live Arrival Board" product on the Rail Data Marketplace
// (raildata.org.uk) — a first-party REST API, no third-party proxy involved.
// Free: subscribe to "Live Arrival Board" at raildata.org.uk, then grab the
// Consumer key from that subscription's Specification tab.
//
// Until RAIL_DATA_MARKETPLACE_API_KEY is set this degrades gracefully — a 200
// with configured:false — so the widget can show a calm "not set up yet"
// state instead of erroring.
const MARGATE_CRS = 'MAR';
const ARRIVALS_URL = `https://api1.raildata.org.uk/1010-live-arrival-board-arr/LDBWS/api/20220120/GetArrBoardWithDetails/${MARGATE_CRS}`;

interface RdmLocation {
  locationName?: string;
  crs?: string;
}
interface RdmService {
  sta?: string; // scheduled time of arrival
  eta?: string; // estimated time of arrival, or a status string ("On time", "Delayed" etc.)
  operator?: string;
  platform?: string | null;
  isCancelled?: boolean;
  origin?: RdmLocation[]; // where the train is coming FROM — the useful field on an arrivals board
}
interface RdmMessage {
  value?: string;
}

export async function GET() {
  const apiKey = process.env.RAIL_DATA_MARKETPLACE_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ configured: false });
  }

  try {
    const res = await fetch(ARRIVALS_URL, {
      headers: { 'x-apikey': apiKey },
      cache: 'no-store',
    });

    if (!res.ok) {
      return NextResponse.json(
        { configured: true, error: `Arrivals request was rejected (HTTP ${res.status})` },
        { status: 502 }
      );
    }

    const data = await res.json();
    const services: RdmService[] = Array.isArray(data?.trainServices) ? data.trainServices : [];

    const trains = services.map((s) => ({
      sta: s.sta ?? '',
      eta: s.isCancelled ? 'Cancelled' : s.eta ?? 'On time',
      operator: s.operator ?? 'Unknown operator',
      origin: s.origin?.[0]?.locationName ?? s.origin?.[0]?.crs ?? 'Unknown',
      platform: s.platform ?? null,
    }));

    // The feed's disruption messages sometimes carry raw HTML — strip tags so
    // the client can render them as plain text without dangerouslySetInnerHTML.
    const stripHtml = (s: string) => s.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    const nrccMessages: string[] = Array.isArray(data?.nrccMessages)
      ? (data.nrccMessages as RdmMessage[])
          .map((m) => (m.value ? stripHtml(m.value) : ''))
          .filter((v): v is string => Boolean(v))
      : [];

    return NextResponse.json({
      configured: true,
      locationName: data?.locationName ?? 'Margate',
      generatedAt: data?.generatedAt ?? new Date().toISOString(),
      nrccMessages,
      trains,
    });
  } catch {
    return NextResponse.json({ configured: true, error: 'Failed to fetch train arrivals' }, { status: 502 });
  }
}
