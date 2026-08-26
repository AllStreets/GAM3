# HYPERION

*The watch from above.*

A browser game about running a private orbital agency over a living Earth —
real orbital mechanics, real live world events, and an AI-woven world that
grows differently for every player.

**Status:** Plan 12 (Living World) shipped — the world evolves **while you're offline**: a scheduled server tick advances every away player's world in Neon (contracts expire, the rival claims races you didn't finish, fresh contracts appear, story arcs escalate), and you return to a "while you were away" digest of what changed. (Builds on Plan 11 cloud persistence + accounts, Plan 10 resilience & progression, Plan 9 story engine, Plan 8 living places, Plan 7B soul & spectacle.)

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
