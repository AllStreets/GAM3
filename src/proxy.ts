/**
 * Clerk proxy for HYPERION (Next.js 16 "proxy" file convention).
 *
 * Every route is public — login is OPTIONAL. We never call auth().protect()
 * here. The proxy only runs Clerk's token verification so that server
 * components and API routes can call `auth()` to read the (optional) userId.
 *
 * API: @clerk/nextjs v7 (Core 3) — clerkMiddleware from @clerk/nextjs/server.
 * Next.js 16 renamed middleware.ts → proxy.ts; the default export must be
 * a NextMiddleware-compatible function, which clerkMiddleware() returns.
 */

import { clerkMiddleware } from '@clerk/nextjs/server'

// All routes are public — pass no handler so Clerk never blocks anything.
export default clerkMiddleware()

export const config = {
  matcher: [
    // Skip Next.js internals and static files.
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes.
    '/(api|trpc)(.*)',
  ],
}
