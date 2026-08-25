import { NextRequest, NextResponse } from 'next/server'
import { pickBestImage, type PlaceImage, type WikiImagePage } from '@/lib/placeImage'
import { nearestCuratedImage } from '@/data/cityImages'

// ── In-memory cache ────────────────────────────────────────────────────────────
// Keyed by "${lat.toFixed(1)},${lon.toFixed(1)}" — ~1°×1° cells
// Bounded at 200 entries; evict oldest when full.
const cache = new Map<string, PlaceImage>()
const CACHE_MAX = 200

function cacheKey(lat: number, lon: number): string {
  return `${lat.toFixed(1)},${lon.toFixed(1)}`
}

function cacheSet(key: string, value: PlaceImage): void {
  if (cache.size >= CACHE_MAX) {
    // Evict the oldest (first) entry
    const firstKey = cache.keys().next().value
    if (firstKey !== undefined) cache.delete(firstKey)
  }
  cache.set(key, value)
}

// ── NONE constant ──────────────────────────────────────────────────────────────
const NONE_RESULT: PlaceImage = { url: '', attribution: '', title: '', source: 'none' }

// ── Wikimedia Commons geosearch URL ───────────────────────────────────────────
function wikimediaUrl(lat: number, lon: number): string {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    generator: 'geosearch',
    ggsprimary: 'all',
    ggsnamespace: '6',
    ggscoord: `${lat}|${lon}`,
    ggsradius: '10000',
    ggslimit: '20',
    prop: 'imageinfo',
    iiprop: 'url|extmetadata|mediatype|size',
    origin: '*',
  })
  return `https://commons.wikimedia.org/w/api.php?${params.toString()}`
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // ── Parse and validate query params ─────────────────────────────────────
    const { searchParams } = request.nextUrl
    const rawLat = searchParams.get('lat')
    const rawLon = searchParams.get('lon')

    if (rawLat === null || rawLon === null) {
      return NextResponse.json(NONE_RESULT, { status: 200 })
    }

    const parsedLat = parseFloat(rawLat)
    const parsedLon = parseFloat(rawLon)

    if (!isFinite(parsedLat) || !isFinite(parsedLon)) {
      return NextResponse.json(NONE_RESULT, { status: 200 })
    }

    // Clamp to valid coordinate ranges
    const lat = Math.max(-90, Math.min(90, parsedLat))
    const lon = Math.max(-180, Math.min(180, parsedLon))

    // ── Cache check ──────────────────────────────────────────────────────────
    const key = cacheKey(lat, lon)
    const cached = cache.get(key)
    if (cached) {
      return NextResponse.json(cached)
    }

    // ── Wikimedia Commons geosearch ──────────────────────────────────────────
    let result: PlaceImage | null = null

    try {
      const url = wikimediaUrl(lat, lon)
      const res = await fetch(url, {
        signal: AbortSignal.timeout(8_000),
        next: { revalidate: 86_400 },
      })

      if (res.ok) {
        const data = (await res.json()) as {
          query?: { pages?: Record<string, WikiImagePage> }
        }

        const pagesObj = data?.query?.pages
        if (pagesObj && typeof pagesObj === 'object') {
          const pages = Object.values(pagesObj)
          const best = pickBestImage(pages)
          if (best) {
            result = { ...best, source: 'wikimedia' }
          }
        }
      }
    } catch {
      // Wikimedia fetch failed or timed out — fall through to curated
    }

    // ── Curated fallback ─────────────────────────────────────────────────────
    if (!result) {
      const curated = nearestCuratedImage(lat, lon)
      if (curated) {
        result = {
          url: curated.url,
          attribution: curated.attribution,
          title: curated.name,
          source: 'curated',
        }
      }
    }

    // ── Final fallback ───────────────────────────────────────────────────────
    if (!result) {
      result = { ...NONE_RESULT }
    }

    // ── Cache and respond ────────────────────────────────────────────────────
    cacheSet(key, result)
    return NextResponse.json(result)
  } catch {
    // ALWAYS-200: any uncaught error → source:'none'
    return NextResponse.json(NONE_RESULT)
  }
}
