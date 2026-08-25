# HYPERION

*The watch from above.*

A browser game about running a private orbital agency over a living Earth —
real orbital mechanics, real live world events, and an AI-woven world that
grows differently for every player.

**Status:** Plan 8 (Living Places) shipped — click any point on Earth for a Place Card with a real city photo, cinematically zoom from orbit into the city, summon AI contracts grounded in that location, and capture named-by-place postcards. (Builds on Plan 7B: named/specialized satellites with real loss, per-user agency archetypes that flavor the AI, scored maneuvers & trick-shots, a cinematic completion set-piece, emergencies, cold-open, walkthrough, postcards.)

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
