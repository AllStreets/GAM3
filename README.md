# HYPERION

*The watch from above.*

A browser game about running a private orbital agency over a living Earth —
real orbital mechanics, real live world events, and an AI-woven world that
grows differently for every player.

**Status:** Plan 7A.5 (legibility & pacing) complete — the core loop now teaches itself.

## Stack

Next.js (App Router) · Three.js · Neon Postgres + Clerk (via Vercel
Marketplace, from Plan 3) · Anthropic API (from Plan 5)

## Develop

    pnpm install
    pnpm dev        # http://localhost:3100
    pnpm test       # unit tests (orbital/geo math)
    pnpm e2e        # Playwright smoke test

## Environment

- `ANTHROPIC_API_KEY` — server-side only, enables AI briefings (omit for deterministic fallback).

## Documents

- Design spec: `docs/superpowers/specs/2026-08-22-hyperion-design.md`
- Plans: `docs/superpowers/plans/`
