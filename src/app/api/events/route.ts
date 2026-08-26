import { NextResponse } from 'next/server'
import { fetchWorldEventsWithStatus } from '@/lib/eventsSource'

export async function GET() {
  const { events, sources } = await fetchWorldEventsWithStatus()

  return NextResponse.json({
    events,
    sources,
    fetchedAt: new Date().toISOString(),
  })
}
