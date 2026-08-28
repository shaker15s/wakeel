import { PrismaClient } from '@prisma/client'

/**
 * Model delegates the current schema must expose. If the cached dev-server
 * singleton predates a `prisma generate` (e.g. a newly pushed model), the
 * stale instance is discarded and a fresh client is created — no restart
 * needed after `bun run db:push`.
 */
const EXPECTED_MODELS = [
  'user',
  'aiSystem',
  'systemRecord',
  'scanSession',
  'activity',
  'chatMessage',
  'automationRun',
  'shareLink',
] as const

function isStale(client: PrismaClient): boolean {
  return EXPECTED_MODELS.some(
    (m) => (client as unknown as Record<string, unknown>)[m] === undefined
  )
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

if (globalForPrisma.prisma && isStale(globalForPrisma.prisma)) {
  // schema gained models since this client was instantiated — drop it
  globalForPrisma.prisma = undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['query'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
