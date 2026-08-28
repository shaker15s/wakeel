import { NextResponse } from "next/server";

/**
 * Wakeel in-memory sliding-window rate limiter.
 *
 * Designed for a single-node deployment (the documented stage of this app).
 * Keys are namespaced per bucket so each caller picks its own limits:
 *
 *   const rl = rateLimit(`chat:${account.id}`, LIMITS.chat)
 *   if (!rl.ok) return jsonError(429, ...)
 *
 * Storage is a Map of per-key timestamp rings. Old hits are pruned lazily on
 * every check and a global sweep keeps memory bounded under key-flood attacks.
 */

interface LimiterOptions {
  /** sliding window length in ms */
  windowMs: number;
  /** max requests allowed inside the window */
  max: number;
}

export interface RateLimitResult {
  ok: boolean;
  /** seconds until the next request would pass (for Retry-After) */
  retryAfter: number;
  remaining: number;
}

const hits = new Map<string, number[]>();
const MAX_KEYS = 10_000;

function sweep(now: number): void {
  if (hits.size <= MAX_KEYS) return;
  for (const [key, ring] of hits) {
    const alive = ring.filter((t) => now - t < 3_600_000);
    if (alive.length === 0) hits.delete(key);
    else hits.set(key, alive);
  }
}

export function rateLimit(key: string, opts: LimiterOptions): RateLimitResult {
  const now = Date.now();
  if (hits.size > MAX_KEYS) sweep(now);

  const ring = hits.get(key) ?? [];
  const windowStart = now - opts.windowMs;
  const alive = ring.filter((t) => t > windowStart);

  if (alive.length >= opts.max) {
    const oldest = Math.min(...alive);
    hits.set(key, alive);
    return {
      ok: false,
      retryAfter: Math.max(1, Math.ceil((oldest + opts.windowMs - now) / 1000)),
      remaining: 0,
    };
  }

  alive.push(now);
  hits.set(key, alive);
  return { ok: true, retryAfter: 0, remaining: opts.max - alive.length };
}

/** Standard 429 response with Retry-After. */
export function tooManyRequests(res: RateLimitResult, message?: string): NextResponse {
  return NextResponse.json(
    {
      error:
        message ??
        "Too many requests — slow down for a moment before trying again.",
    },
    { status: 429, headers: { "Retry-After": String(res.retryAfter) } },
  );
}

/**
 * Central bucket catalogue — one place to audit the whole cost surface.
 * LLM routes are per-account (fair use), auth routes per-IP (brute force).
 */
export const LIMITS = {
  authLogin: { windowMs: 15 * 60_000, max: 10 },
  authRegister: { windowMs: 60 * 60_000, max: 8 },
  llmChat: { windowMs: 5 * 60_000, max: 30 },
  llmScan: { windowMs: 60 * 60_000, max: 12 },
  llmForge: { windowMs: 60 * 60_000, max: 20 },
  llmSeed: { windowMs: 60 * 60_000, max: 30 },
  llmSuggest: { windowMs: 60 * 60_000, max: 30 },
  llmDigest: { windowMs: 60 * 60_000, max: 30 },
  importWorkspace: { windowMs: 60 * 60_000, max: 20 },
  importCsv: { windowMs: 60 * 60_000, max: 30 },
  recordWrite: { windowMs: 60_000, max: 120 },
  automationRun: { windowMs: 5 * 60_000, max: 60 },
  sharePublic: { windowMs: 60_000, max: 30 },
} as const;
