import { create } from 'zustand'

interface PlaceState {
  place: { lat: number; lon: number } | null
  reveal: { lat: number; lon: number; label: string } | null

  inspect(lat: number, lon: number): void
  clear(): void
  focusReveal(lat: number, lon: number, label: string): void
  clearReveal(): void
}

export const usePlaceStore = create<PlaceState>((set) => ({
  place: null,
  reveal: null,

  inspect: (lat, lon) => set({ place: { lat, lon } }),
  clear: () => set({ place: null }),
  focusReveal: (lat, lon, label) => set({ reveal: { lat, lon, label } }),
  clearReveal: () => set({ reveal: null }),
}))
