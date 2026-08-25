import { create } from 'zustand'

/** Maximum number of recent postcards kept in session (dataURLs are heavy). */
const MAX_SESSION_POSTCARDS = 3

interface PlaceState {
  place: { lat: number; lon: number } | null
  reveal: { lat: number; lon: number; label: string } | null
  /** Recent postcards captured this session — NOT persisted to localStorage. */
  postcards: string[]

  inspect(lat: number, lon: number): void
  clear(): void
  focusReveal(lat: number, lon: number, label: string): void
  clearReveal(): void
  addPostcard(dataUrl: string): void
}

export const usePlaceStore = create<PlaceState>((set) => ({
  place: null,
  reveal: null,
  postcards: [],

  inspect: (lat, lon) => set({ place: { lat, lon } }),
  clear: () => set({ place: null }),
  focusReveal: (lat, lon, label) => set({ reveal: { lat, lon, label } }),
  clearReveal: () => set({ reveal: null }),
  addPostcard: (dataUrl: string) =>
    set((s) => ({
      postcards: [dataUrl, ...s.postcards].slice(0, MAX_SESSION_POSTCARDS),
    })),
}))

// Expose the store on window in non-production so Playwright e2e tests can
// trigger place inspection without depending on WebGL raycasting.
if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
  ;(window as unknown as Record<string, unknown>).__placeStore = usePlaceStore
}
