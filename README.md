# HYPERION

*The watch from above.*

A browser game about running a private orbital agency over a living Earth —
real orbital mechanics, real live world events, and an AI-woven world that
grows differently for every player.

**Status:** Plan 9 (Story Engine) shipped — the world has memory and drama: completing a contract over a place blooms its real city photo into the cinematic; more real feeds (GDACS disasters, NOAA space-weather, more EONET categories); contracts vary in *how* you play them (multi-pass / multi-satellite / dwell); an AI story engine grows dispatches and arcs from your record; and a rival agency with memory races you for contracts. (Builds on Plan 8 living places, Plan 7B soul & spectacle.)

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
