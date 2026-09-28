import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Uptime monitor (BetterStack) — 03_SIGURNOST.md
export async function GET() {
  const started = Date.now();
  let db = false;
  try {
    db = await getDb().ping();
  } catch (err) {
    console.error('[health] db ping', err);
  }
  return NextResponse.json(
    { status: db ? 'ok' : 'degraded', db, ms: Date.now() - started, version: process.env.NEXT_PUBLIC_GIT_SHA ?? 'dev' },
    { status: db ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
  );
}
