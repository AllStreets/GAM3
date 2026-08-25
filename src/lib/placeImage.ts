/** Metadata extractor value shape from Wikimedia API */
export interface WikiExtmetadataValue {
  value: string
}

/** A single page (image file) returned by the Wikimedia Commons imageinfo API */
export interface WikiImagePage {
  title: string
  imageinfo?: {
    url: string
    extmetadata?: Record<string, WikiExtmetadataValue>
    width?: number
    height?: number
    mediatype?: string
  }[]
}

/** A resolved place image with licensing attribution */
export interface PlaceImage {
  url: string
  attribution: string
  title: string
  source: 'wikimedia' | 'curated' | 'none'
}

/** Strip HTML tags from a string (e.g. Wikimedia extmetadata values) */
function stripHtml(value: string): string {
  return value.replace(/<[^>]+>/g, '').trim()
}

/**
 * Pure function: from a list of Wikimedia imageinfo pages, pick the best
 * usable photo.
 *
 * Filters:
 *  - mediatype must be 'BITMAP'
 *  - width >= 800
 *  - extmetadata must include Artist OR LicenseShortName (usable attribution)
 *
 * Ranking:
 *  1. Landscape (width >= height) preferred over portrait
 *  2. Among equal orientation, larger area wins
 *
 * Returns { url, attribution, title } or null if none qualify.
 */
export function pickBestImage(
  pages: WikiImagePage[],
): { url: string; attribution: string; title: string } | null {
  interface Candidate {
    url: string
    attribution: string
    title: string
    isLandscape: boolean
    area: number
  }

  const candidates: Candidate[] = []

  for (const page of pages) {
    if (!page.imageinfo?.length) continue
    const info = page.imageinfo[0]

    // Must be a bitmap photo
    if (info.mediatype !== 'BITMAP') continue

    // Must have usable width
    const w = info.width ?? 0
    const h = info.height ?? 0
    if (w < 800) continue

    // Must have usable attribution (Artist or LicenseShortName)
    const meta = info.extmetadata
    if (!meta) continue
    const artistRaw = meta['Artist']?.value ?? ''
    const licenseRaw = meta['LicenseShortName']?.value ?? ''
    if (!artistRaw && !licenseRaw) continue

    const artist = stripHtml(artistRaw)
    const license = stripHtml(licenseRaw)

    // Build the attribution string
    const parts: string[] = []
    if (artist) parts.push(artist)
    if (license) parts.push(license)
    const attribution = parts.join(' · ')

    candidates.push({
      url: info.url,
      attribution,
      title: page.title,
      isLandscape: w >= h,
      area: w * h,
    })
  }

  if (candidates.length === 0) return null

  // Sort: landscape first, then by area descending
  candidates.sort((a, b) => {
    if (a.isLandscape !== b.isLandscape) return a.isLandscape ? -1 : 1
    return b.area - a.area
  })

  const best = candidates[0]
  return {
    url: best.url,
    attribution: best.attribution,
    title: best.title,
  }
}
