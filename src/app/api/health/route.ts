import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({ ok: true, version: '2026-04-13-v2' });
}
