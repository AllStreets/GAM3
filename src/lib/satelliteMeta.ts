export type Capability = 'imaging' | 'comms' | 'thermal'

export interface ServiceRecord {
  contractsCompleted: number
  notablePasses: string[]
  commissionedAt: number
}

export const CAPABILITY_LABEL: Record<Capability, string> = {
  imaging: 'OPTICAL',
  comms: 'RELAY',
  thermal: 'THERMAL',
}

const SEED: Capability[] = ['imaging', 'imaging', 'comms', 'thermal', 'comms']

export function seedCapability(index: number): Capability {
  return SEED[index] ?? (['imaging', 'comms', 'thermal'][index % 3] as Capability)
}

export function fillGapCapability(existing: Capability[]): Capability {
  const order: Capability[] = ['imaging', 'comms', 'thermal']
  const count = (c: Capability) => existing.filter((x) => x === c).length
  return order.reduce((best, c) => (count(c) < count(best) ? c : best), order[0])
}

export function freshRecord(commissionedAt: number): ServiceRecord {
  return { contractsCompleted: 0, notablePasses: [], commissionedAt }
}

export function simDaysInOrbit(commissionedAt: number, now: number): number {
  return Math.max(0, Math.floor((now - commissionedAt) / 86400))
}
