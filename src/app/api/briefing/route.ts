import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod'

export const maxDuration = 60

const BriefingSchema = z.object({
  headline: z.string(),
  situation: z.string(),
  advisory: z.string(),
  missions: z.array(
    z.object({
      title: z.string(),
      eventId: z.string(),
      objective: z.string(),
    }),
  ),
})

type Briefing = z.infer<typeof BriefingSchema>

interface BriefingRequest {
  profile: {
    burns: number; aborts: number; dvSpent: number; avgQuality: number
    favoriteKind: string | null; sessions: number; lastSeen: string | null
  }
  fleet: Array<{ name: string; altKm: number; fuelPct: number }>
  events: Array<{ id: string; kind: string; title: string; severity: number; time: string }>
}

const SYSTEM = `You are HYPERION Mission Control — the intelligence officer for a private orbital agency operating a small satellite fleet over the real, live Earth.

You write the operator's situation briefing. Voice: terse, professional, situation-room. Second person ("your fleet", "you tend to").

HARD RULES:
- The events you are given are REAL, current world events. Real disasters may have real victims. NEVER gamify human suffering: no scores, rewards, villains, or fictional stakes attached to real tragedies. Missions on real events are strictly observation, mapping, communications-relay, or monitoring support framed as aiding responders.
- Missions MUST reference eventId values from the provided list only. 2 or 3 missions.
- headline: max 10 words, punchy, all-caps feels right. situation: 2-3 sentences synthesizing the most significant current events. advisory: 1-2 sentences of personalized guidance derived from the operator's playstyle statistics (e.g. sloppy burn quality -> suggest trimming with A/D; many aborts -> steadier commitment; heavy quake focus -> note their seismic specialization).
- Objectives are concrete and reference the satellite capabilities implied by the fleet data (imaging passes, comms relay, thermal mapping).`

function fallbackBriefing(body: BriefingRequest): Briefing {
  const top = [...(body.events ?? [])].sort((a, b) => b.severity - a.severity).slice(0, 2)
  return {
    headline: 'THE WATCH CONTINUES',
    situation: top.length
      ? `Tracking ${body.events.length} active events. Most significant: ${top.map((e) => e.title).join('; ')}.`
      : 'The world is quiet. All feeds nominal.',
    advisory:
      body.profile?.burns > 0
        ? `You have executed ${body.profile.burns} burns at ${(body.profile.avgQuality * 100).toFixed(0)}% average quality. Steady hands keep fuel margins healthy.`
        : 'No burns on record yet. Select a satellite and plan your first maneuver.',
    missions: top.map((e, i) => ({
      title: i === 0 ? 'Priority Observation' : 'Secondary Watch',
      eventId: e.id,
      objective: `Maintain observation coverage of "${e.title}" on upcoming passes.`,
    })),
  }
}

export async function POST(request: Request) {
  let body: BriefingRequest
  try {
    body = (await request.json()) as BriefingRequest
  } catch {
    return NextResponse.json({
      source: 'fallback',
      briefing: fallbackBriefing({ profile: { burns: 0, aborts: 0, dvSpent: 0, avgQuality: 0, favoriteKind: null, sessions: 0, lastSeen: null }, fleet: [], events: [] }),
    })
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ source: 'fallback', briefing: fallbackBriefing(body) })
  }

  try {
    const client = new Anthropic()
    const response = await client.messages.parse({
      model: 'claude-opus-4-8',
      max_tokens: 16000,
      system: SYSTEM,
      output_config: { format: zodOutputFormat(BriefingSchema), effort: 'low' },
      messages: [
        {
          role: 'user',
          content: `Operator playstyle: ${JSON.stringify(body.profile)}\nFleet: ${JSON.stringify(body.fleet)}\nCurrent world events (id, kind, title, severity, time): ${JSON.stringify(body.events.slice(0, 25))}\n\nWrite the situation briefing.`,
        },
      ],
    })

    const parsed = response.parsed_output
    if (!parsed) throw new Error('no parsed output')

    // Enforce: missions must reference provided event ids (drop any that don't)
    const validIds = new Set(body.events.map((e) => e.id))
    const briefing: Briefing = { ...parsed, missions: parsed.missions.filter((m) => validIds.has(m.eventId)) }

    return NextResponse.json({ source: 'ai', briefing })
  } catch (err) {
    console.error('briefing generation failed, using fallback:', err)
    return NextResponse.json({ source: 'fallback', briefing: fallbackBriefing(body) })
  }
}
