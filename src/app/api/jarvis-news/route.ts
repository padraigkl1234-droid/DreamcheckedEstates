import { NextResponse } from 'next/server';

export const revalidate = 300;

interface NewsItem {
  title: string;
  link: string;
  image: string | null;
  pubDate: string | null;
}

const FEEDS = {
  general: 'http://feeds.bbci.co.uk/news/rss.xml',
  business: 'http://feeds.bbci.co.uk/news/business/rss.xml',
  football: 'http://feeds.bbci.co.uk/sport/football/rss.xml',
};

function decodeEntities(text: string): string {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractTag(block: string, tag: string): string | null {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match ? decodeEntities(match[1]) : null;
}

function extractThumbnail(block: string): string | null {
  const match = block.match(/<media:thumbnail[^>]*url="([^"]+)"/i);
  return match ? match[1] : null;
}

function parseFeed(xml: string, limit: number): NewsItem[] {
  const items: NewsItem[] = [];
  const itemBlocks = xml.match(/<item>([\s\S]*?)<\/item>/g) ?? [];
  for (const block of itemBlocks.slice(0, limit)) {
    const title = extractTag(block, 'title');
    const link = extractTag(block, 'link');
    const pubDate = extractTag(block, 'pubDate');
    const image = extractThumbnail(block);
    if (title && link) items.push({ title, link, image, pubDate });
  }
  return items;
}

export async function GET() {
  try {
    const [generalRes, businessRes, footballRes] = await Promise.all([
      fetch(FEEDS.general, { headers: { 'User-Agent': 'Mozilla/5.0' }, cache: 'no-store' }),
      fetch(FEEDS.business, { headers: { 'User-Agent': 'Mozilla/5.0' }, cache: 'no-store' }),
      fetch(FEEDS.football, { headers: { 'User-Agent': 'Mozilla/5.0' }, cache: 'no-store' }),
    ]);

    if (!generalRes.ok || !businessRes.ok || !footballRes.ok) {
      return NextResponse.json(
        { general: [], business: [], football: [], fetchedAt: new Date().toISOString(), error: 'BBC feed request was rejected' },
        { status: 502 },
      );
    }

    const [generalXml, businessXml, footballXml] = await Promise.all([
      generalRes.text(),
      businessRes.text(),
      footballRes.text(),
    ]);
    const general = parseFeed(generalXml, 4);
    const business = parseFeed(businessXml, 4);
    const football = parseFeed(footballXml, 4);

    if (general.length === 0 && business.length === 0 && football.length === 0) {
      return NextResponse.json(
        { general: [], business: [], football: [], fetchedAt: new Date().toISOString(), error: 'BBC feed response did not contain any items' },
        { status: 502 },
      );
    }

    return NextResponse.json({
      general,
      business,
      football,
      fetchedAt: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json(
      { general: [], business: [], football: [], fetchedAt: new Date().toISOString(), error: 'Failed to fetch BBC feeds' },
      { status: 502 },
    );
  }
}
