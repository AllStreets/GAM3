import { greatCircleKm } from '@/lib/geo'

export interface CuratedCityImage {
  name: string
  lat: number
  lon: number
  url: string
  attribution: string
}

/**
 * Curated fallback photos for major world cities.
 * All URLs are stable Wikimedia Commons upload URLs pointing to well-known,
 * freely-licensed photographs.
 *
 * Sources: https://commons.wikimedia.org — all CC-licensed or Public Domain.
 */
export const CURATED_CITY_IMAGES: CuratedCityImage[] = [
  {
    name: 'New York City',
    lat: 40.71,
    lon: -74.01,
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/05/Southwest_corner_of_Central_Park%2C_looking_east%2C_NYC.jpg/1280px-Southwest_corner_of_Central_Park%2C_looking_east%2C_NYC.jpg',
    attribution: 'King of Hearts · CC BY-SA 3.0',
  },
  {
    name: 'London',
    lat: 51.51,
    lon: -0.13,
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/67/London_Skyline_%28125508655%29.jpeg/1280px-London_Skyline_%28125508655%29.jpeg',
    attribution: 'Mariordo · CC BY-SA 4.0',
  },
  {
    name: 'Paris',
    lat: 48.85,
    lon: 2.35,
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/New_view_of_the_Eiffel_Tower_from_Trocadero.jpg/1280px-New_view_of_the_Eiffel_Tower_from_Trocadero.jpg',
    attribution: 'Benh LIEU SONG · CC BY-SA 3.0',
  },
  {
    name: 'Tokyo',
    lat: 35.69,
    lon: 139.69,
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b2/Skyscrapers_of_Shinjuku_2009_January.jpg/1280px-Skyscrapers_of_Shinjuku_2009_January.jpg',
    attribution: 'Morio · CC BY-SA 3.0',
  },
  {
    name: 'Sydney',
    lat: -33.87,
    lon: 151.21,
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5e/Sydney_from_the_air_Feb_2013.jpg/1280px-Sydney_from_the_air_Feb_2013.jpg',
    attribution: 'Jjron · CC BY-SA 3.0',
  },
  {
    name: 'Dubai',
    lat: 25.20,
    lon: 55.27,
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e6/Dubai_Marina_Skyline.jpg/1280px-Dubai_Marina_Skyline.jpg',
    attribution: 'Imre Solt · CC BY-SA 3.0',
  },
  {
    name: 'Hong Kong',
    lat: 22.31,
    lon: 114.17,
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a3/Hong_Kong_Night_Skyline2.jpg/1280px-Hong_Kong_Night_Skyline2.jpg',
    attribution: 'Wikimedia Commons · CC BY-SA 3.0',
  },
  {
    name: 'São Paulo',
    lat: -23.55,
    lon: -46.63,
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5a/Sao_paulo_from_the_plane%2C_2010.jpg/1280px-Sao_paulo_from_the_plane%2C_2010.jpg',
    attribution: 'Rodrigo Soldon · CC BY 2.0',
  },
  {
    name: 'Rio de Janeiro',
    lat: -22.91,
    lon: -43.17,
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/bd/Cidade_Maravilhosa.jpg/1280px-Cidade_Maravilhosa.jpg',
    attribution: 'Halley Pacheco de Oliveira · CC BY-SA 3.0',
  },
  {
    name: 'Buenos Aires',
    lat: -34.60,
    lon: -58.38,
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a9/BuenosAires_Skyline.jpg/1280px-BuenosAires_Skyline.jpg',
    attribution: 'Dario Alpern · CC BY-SA 3.0',
  },
  {
    name: 'Mexico City',
    lat: 19.43,
    lon: -99.13,
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/de/Ciudad.de.Mexico.City.Distrito.Federal.DF.Paseo.Reforma.Skyline.jpg/1280px-Ciudad.de.Mexico.City.Distrito.Federal.DF.Paseo.Reforma.Skyline.jpg',
    attribution: 'Mariordo · CC BY-SA 3.0',
  },
  {
    name: 'Moscow',
    lat: 55.75,
    lon: 37.62,
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/56/Moscow_July_2011-8a.jpg/1280px-Moscow_July_2011-8a.jpg',
    attribution: 'Pline · CC BY-SA 3.0',
  },
  {
    name: 'Istanbul',
    lat: 41.01,
    lon: 28.97,
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e5/Istanbul_seen_from_the_Marmara_Sea.jpg/1280px-Istanbul_seen_from_the_Marmara_Sea.jpg',
    attribution: 'Myrabella · CC BY-SA 3.0',
  },
  {
    name: 'Cairo',
    lat: 30.04,
    lon: 31.24,
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f4/Cairo%2C_Egypt.jpg/1280px-Cairo%2C_Egypt.jpg',
    attribution: 'Wikimedia Commons · CC BY-SA 3.0',
  },
  {
    name: 'Mumbai',
    lat: 19.08,
    lon: 72.88,
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1d/Mumbai_Skyline_at_Night.JPG/1280px-Mumbai_Skyline_at_Night.JPG',
    attribution: 'Gurpreet Singh Walia · CC BY-SA 3.0',
  },
  {
    name: 'Delhi',
    lat: 28.66,
    lon: 77.23,
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/95/Delhi_India.jpg/1280px-Delhi_India.jpg',
    attribution: 'Wikimedia Commons · CC BY-SA 3.0',
  },
  {
    name: 'Singapore',
    lat: 1.28,
    lon: 103.85,
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e9/Singapore_Skyline_2019-05_%2848124912891%29.jpg/1280px-Singapore_Skyline_2019-05_%2848124912891%29.jpg',
    attribution: 'chensiyuan · CC BY-SA 4.0',
  },
  {
    name: 'Seoul',
    lat: 37.57,
    lon: 126.98,
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/38/Namsan_Seoul_Tower_from_Namsan_Park.jpg/1280px-Namsan_Seoul_Tower_from_Namsan_Park.jpg',
    attribution: 'Wikimedia Commons · CC BY-SA 3.0',
  },
  {
    name: 'Los Angeles',
    lat: 34.05,
    lon: -118.24,
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/32/20180926_Long_Beach_California_Aerial_Image.jpg/1280px-20180926_Long_Beach_California_Aerial_Image.jpg',
    attribution: 'Aerovista Luchtfotografie · CC BY-SA 4.0',
  },
  {
    name: 'Chicago',
    lat: 41.85,
    lon: -87.65,
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/bf/Chicago_from_the_lake_%28cropped%29.jpg/1280px-Chicago_from_the_lake_%28cropped%29.jpg',
    attribution: 'Thomas Theil · CC BY-SA 3.0',
  },
  {
    name: 'Berlin',
    lat: 52.52,
    lon: 13.40,
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4b/Brandenburger_Tor_abends.jpg/1280px-Brandenburger_Tor_abends.jpg',
    attribution: 'Thomas Wolf · CC BY-SA 3.0 DE',
  },
  {
    name: 'Rome',
    lat: 41.90,
    lon: 12.50,
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c0/Rome_Skyline.jpg/1280px-Rome_Skyline.jpg',
    attribution: 'David Iliff · CC BY-SA 3.0',
  },
  {
    name: 'Bangkok',
    lat: 13.75,
    lon: 100.52,
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e4/Bkk_skytrain_hua_lamphong.jpg/1280px-Bkk_skytrain_hua_lamphong.jpg',
    attribution: 'Rob Sheridan · CC BY-SA 2.0',
  },
  {
    name: 'Lagos',
    lat: 6.45,
    lon: 3.39,
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/17/Lagos_Island_Skyline.jpg/1280px-Lagos_Island_Skyline.jpg',
    attribution: 'Heinrich-Böll-Stiftung · CC BY-SA 2.0',
  },
  {
    name: 'Nairobi',
    lat: -1.29,
    lon: 36.82,
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5d/Nairobi_Skyline_2018.JPG/1280px-Nairobi_Skyline_2018.JPG',
    attribution: 'Wikimedia Commons · CC BY-SA 4.0',
  },
  {
    name: 'Johannesburg',
    lat: -26.20,
    lon: 28.05,
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a1/Joburg_skyline_from_the_south.jpg/1280px-Joburg_skyline_from_the_south.jpg',
    attribution: 'Flowcomm · CC BY 2.0',
  },
  {
    name: 'Toronto',
    lat: 43.70,
    lon: -79.42,
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/43/Toronto_-_ON_-_Toronto_Skyline_at_Dusk1.jpg/1280px-Toronto_-_ON_-_Toronto_Skyline_at_Dusk1.jpg',
    attribution: 'Wladyslaw · CC BY-SA 3.0',
  },
  {
    name: 'San Francisco',
    lat: 37.77,
    lon: -122.42,
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1e/San_Francisco_from_the_Marin_Headlands_in_March_2019.jpg/1280px-San_Francisco_from_the_Marin_Headlands_in_March_2019.jpg',
    attribution: 'King of Hearts · CC BY-SA 4.0',
  },
  {
    name: 'Amsterdam',
    lat: 52.37,
    lon: 4.90,
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a8/Kanaal_in_Amsterdam.jpg/1280px-Kanaal_in_Amsterdam.jpg',
    attribution: 'Wikimedia Commons · CC BY-SA 3.0',
  },
  {
    name: 'Barcelona',
    lat: 41.39,
    lon: 2.15,
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c3/2007_0910_Barcelone.jpg/1280px-2007_0910_Barcelone.jpg',
    attribution: 'Benh LIEU SONG · CC BY-SA 3.0',
  },
]

/**
 * Find the nearest curated city image within maxKm km.
 * Returns null if no curated city is close enough.
 */
export function nearestCuratedImage(
  lat: number,
  lon: number,
  maxKm = 250,
): CuratedCityImage | null {
  let best: CuratedCityImage | null = null
  let bestKm = Infinity

  for (const entry of CURATED_CITY_IMAGES) {
    const km = greatCircleKm(lat, lon, entry.lat, entry.lon)
    if (km < bestKm && km <= maxKm) {
      bestKm = km
      best = entry
    }
  }

  return best
}
