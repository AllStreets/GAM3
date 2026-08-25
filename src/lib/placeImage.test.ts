import { describe, it, expect } from 'vitest'
import { pickBestImage } from './placeImage'

describe('pickBestImage', () => {
  it('returns null for no pages', () => {
    expect(pickBestImage([])).toBeNull()
  })

  it('skips non-bitmap / tiny images and picks a real photo with attribution', () => {
    const best = pickBestImage([
      { title: 'File:Map.svg', imageinfo: [{ url: 'x.svg', mediatype: 'DRAWING', width: 1000, height: 1000 }] },
      {
        title: 'File:Skyline.jpg',
        imageinfo: [{
          url: 'https://commons/skyline.jpg',
          mediatype: 'BITMAP',
          width: 1600,
          height: 900,
          extmetadata: {
            Artist: { value: 'Jane Doe' },
            LicenseShortName: { value: 'CC BY-SA 4.0' },
          },
        }],
      },
    ])
    expect(best?.url).toBe('https://commons/skyline.jpg')
    expect(best?.attribution).toMatch(/Jane Doe|CC BY-SA/)
  })

  it('rejects images with no usable licensing', () => {
    const best = pickBestImage([
      { title: 'File:NoLicense.jpg', imageinfo: [{ url: 'y.jpg', mediatype: 'BITMAP', width: 1200, height: 800 }] },
    ])
    expect(best).toBeNull()
  })

  it('skips images narrower than 800px', () => {
    const best = pickBestImage([
      {
        title: 'File:Tiny.jpg',
        imageinfo: [{
          url: 'small.jpg',
          mediatype: 'BITMAP',
          width: 799,
          height: 600,
          extmetadata: {
            Artist: { value: 'Photographer' },
          },
        }],
      },
    ])
    expect(best).toBeNull()
  })

  it('prefers landscape (wider) images over portrait ones', () => {
    const best = pickBestImage([
      {
        title: 'File:Portrait.jpg',
        imageinfo: [{
          url: 'portrait.jpg',
          mediatype: 'BITMAP',
          width: 900,
          height: 1200,
          extmetadata: { Artist: { value: 'A' } },
        }],
      },
      {
        title: 'File:Landscape.jpg',
        imageinfo: [{
          url: 'landscape.jpg',
          mediatype: 'BITMAP',
          width: 1200,
          height: 800,
          extmetadata: { Artist: { value: 'B' } },
        }],
      },
    ])
    expect(best?.url).toBe('landscape.jpg')
  })

  it('strips HTML tags from attribution values', () => {
    const best = pickBestImage([
      {
        title: 'File:City.jpg',
        imageinfo: [{
          url: 'city.jpg',
          mediatype: 'BITMAP',
          width: 1000,
          height: 600,
          extmetadata: {
            Artist: { value: '<a href="//commons.wikimedia.org/wiki/User:Foo">Foo Bar</a>' },
            LicenseShortName: { value: '<span>CC BY 4.0</span>' },
          },
        }],
      },
    ])
    expect(best?.attribution).not.toMatch(/<[^>]+>/)
    expect(best?.attribution).toContain('Foo Bar')
    expect(best?.attribution).toContain('CC BY 4.0')
  })

  it('accepts image with only LicenseShortName (no Artist)', () => {
    const best = pickBestImage([
      {
        title: 'File:River.jpg',
        imageinfo: [{
          url: 'river.jpg',
          mediatype: 'BITMAP',
          width: 1000,
          height: 700,
          extmetadata: {
            LicenseShortName: { value: 'Public Domain' },
          },
        }],
      },
    ])
    expect(best).not.toBeNull()
    expect(best?.attribution).toBe('Public Domain')
  })

  it('among multiple valid images picks the largest area', () => {
    const best = pickBestImage([
      {
        title: 'File:A.jpg',
        imageinfo: [{
          url: 'a.jpg',
          mediatype: 'BITMAP',
          width: 1200,
          height: 800,
          extmetadata: { Artist: { value: 'A' } },
        }],
      },
      {
        title: 'File:B.jpg',
        imageinfo: [{
          url: 'b.jpg',
          mediatype: 'BITMAP',
          width: 2000,
          height: 1000,
          extmetadata: { Artist: { value: 'B' } },
        }],
      },
    ])
    expect(best?.url).toBe('b.jpg')
  })
})
