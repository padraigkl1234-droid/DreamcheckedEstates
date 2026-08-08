import { NextResponse } from 'next/server';

export const revalidate = 60;

// Live departures into Margate for the Event Mode page. Huxley2
// (huxley2.azurewebsites.net) is a free public REST/JSON wrapper around
// National Rail's Darwin OpenLDBWS SOAP feed — it still needs a Darwin
// access token passed through, which has no keyless alternative. Free
// registration: https://www.nationalrail.co.uk/100296.aspx
//
// Until NATIONAL_RAIL_LDBWS_TOKEN is set this degrades gracefully — a 200
// with configured:false — rather than erroring, so the widget can show a
// calm "not set up yet" state instead of a broken one.
const MARGATE_CRS = 'MAR';

interface HuxleyDestination {
  locationName?: string;
  crs?: string;
}
interface HuxleyService {
  std?: string;
  etd?: string;
  operator?: string;
  platform?: string | null;
  destination?: HuxleyDestination[];
}
interface HuxleyMessage {
  value?: string;
}

export async function GET() {
  const token = process.env.NATIONAL_RAIL_LDBWS_TOKEN;
  if (!token) {
    return NextResponse.json({ configured: false });
  }

  try {
    const url = `https://huxley2.azurewebsites.net/departures/${MARGATE_CRS}/10?accessToken=${encodeURIComponent(token)}&expand=false`;
    const res = await fetch(url, { cache: 'no-store' });

    if (!res.ok) {
      return NextResponse.json({ configured: true, error: 'Train departures request was rejected' }, { status: 502 });
    }

    const data = await res.json();
    const services: HuxleyService[] = Array.isArray(data?.trainServices) ? data.trainServices : [];

    const trains = services.map((s) => ({
      std: s.std ?? '',
      etd: s.etd ?? 'On time',
      operator: s.operator ?? 'Unknown operator',
      destination: s.destination?.[0]?.locationName ?? s.destination?.[0]?.crs ?? 'Unknown',
      platform: s.platform ?? null,
    }));

    // Darwin's disruption messages sometimes carry raw HTML (e.g. wrapped in
    // <p> tags) — strip tags so the client can render them as plain text
    // without needing dangerouslySetInnerHTML.
    const stripHtml = (s: string) => s.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    const nrccMessages: string[] = Array.isArray(data?.nrccMessages)
      ? (data.nrccMessages as HuxleyMessage[])
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
    return NextResponse.json({ configured: true, error: 'Failed to fetch train departures' }, { status: 502 });
  }
}
