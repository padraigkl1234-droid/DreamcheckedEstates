import { NextResponse } from 'next/server';

export const revalidate = 600;

// Margate, England
const LATITUDE = 51.3813;
const LONGITUDE = 1.3862;

export async function GET() {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${LATITUDE}&longitude=${LONGITUDE}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code&timezone=Europe%2FLondon`;
    const res = await fetch(url, { cache: 'no-store' });

    if (!res.ok) {
      return NextResponse.json({ error: 'Weather request was rejected' }, { status: 502 });
    }

    const data = await res.json();
    const current = data?.current;

    if (!current || typeof current.temperature_2m !== 'number') {
      return NextResponse.json({ error: 'Weather response did not contain current conditions' }, { status: 502 });
    }

    return NextResponse.json({
      temperatureC: Math.round(current.temperature_2m),
      humidity: Math.round(current.relative_humidity_2m),
      windSpeedKmh: Math.round(current.wind_speed_10m),
      weatherCode: current.weather_code,
      fetchedAt: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch weather' }, { status: 502 });
  }
}
