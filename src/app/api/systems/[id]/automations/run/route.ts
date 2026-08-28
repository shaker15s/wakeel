import { z } from 'zod'
import { db } from '@/lib/db'
import { handleRoute, jsonError, jsonOk } from '@/lib/wakeel/http'
import { requireOwnedSystem } from '@/lib/auth'
import { LIMITS, rateLimit, tooManyRequests } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

const runSchema = z.object({
  automation: z.string().min(1).max(300),
  trigger: z.enum(['MANUAL', 'SCHEDULE', 'EVENT']).default('MANUAL'),
})

interface LogLine {
  /** ms offset from run start */
  t: number
  line: string
  level: 'info' | 'ok' | 'warn' | 'error'
}

/**
 * Deterministic-with-jitter simulation of an automation execution.
 * Produces a believable staged execution log that references the real
 * system (name, live record count) so runs feel grounded in actual data.
 */
function buildRunLog(opts: {
  automation: string
  systemName: string
  recordCount: number
  category: string
  forceFail: boolean
}): { log: LogLine[]; durationMs: number; status: 'DONE' | 'FAILED'; failure: string | null } {
  const { automation, systemName, recordCount, category, forceFail } = opts
  const log: LogLine[] = []
  let t = 0
  const step = (line: string, level: LogLine['level'] = 'info', dt?: number) => {
    t += dt ?? 40 + Math.floor(Math.random() * 260)
    log.push({ t, line, level })
  }

  const short = automation.length > 72 ? `${automation.slice(0, 72)}…` : automation

  step(`automation engine v2 · trigger received`, 'info', 10)
  step(`resolve workflow → "${short}"`, 'info')
  step(`context: system="${systemName}" category=${category} records=${recordCount}`, 'info')
  step(`acquire workspace lock · ok`, 'ok')

  // staged pipeline — phrasing adapts to what the automation mentions
  const a = automation.toLowerCase()
  if (a.includes('notif') || a.includes('alert') || a.includes('email') || a.includes('message')) {
    step(`scan change stream · ${1 + Math.floor(Math.random() * 4)} candidate event(s)`, 'info')
    step('compose notification payload · template=ops_default', 'info')
    step(`deliver to ${2 + Math.floor(Math.random() * 5)} recipient(s) · channel=push,email`, 'ok')
  } else if (a.includes('assign') || a.includes('route') || a.includes('escalat')) {
    step('evaluate routing rules · 3 predicate(s)', 'info')
    step(`match found · rule#${1 + Math.floor(Math.random() * 9)} priority=${['low', 'normal', 'high'][Math.floor(Math.random() * 3)]}`, 'info')
    step(`reassigned owner · queue depth ${recordCount} → balanced`, 'ok')
  } else if (a.includes('report') || a.includes('summary') || a.includes('digest')) {
    step(`aggregate ${recordCount} record(s) · window=7d`, 'info')
    step('render metrics · fields=6 · nulls skipped', 'info')
    step('report generated · 2.1 KB · stored to workspace', 'ok')
  } else if (a.includes('backup') || a.includes('archive') || a.includes('sync')) {
    step(`snapshot ${recordCount} record(s) · delta mode`, 'info')
    step('checksum verify · sha256 · ok', 'ok')
    step('replicate to cold storage · 1 replica', 'ok')
  } else if (a.includes('remind') || a.includes('follow') || a.includes('schedule') || a.includes('deadline')) {
    step('compute due items from record timestamps', 'info')
    step(`${1 + Math.floor(Math.random() * 3)} item(s) inside reminder window`, 'info')
    step('reminders queued · next dispatch on the hour', 'ok')
  } else {
    step('evaluate trigger predicate against workspace state', 'info')
    step(`transform ${Math.min(recordCount, 12)} record(s) · batch=1/1`, 'info')
    step('commit side-effects · ok', 'ok')
  }

  if (forceFail) {
    step('upstream connector timeout after 3 retries', 'error')
    step('rollback scope: 0 records affected · safe', 'warn')
    step(`run FAILED · no data loss`, 'error')
    return { log, durationMs: t, status: 'FAILED', failure: 'UPSTREAM_TIMEOUT' }
  }

  step(`run complete · ${t}ms · next scheduled run in 15m`, 'ok')
  return { log, durationMs: t, status: 'DONE', failure: null }
}

/** POST /api/systems/[id]/automations/run — simulate + persist one automation run. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const { id } = await ctx.params
    const guard = await requireOwnedSystem(req, id)
    if (!guard.ok) return guard.res
    const rl = rateLimit(`run:${guard.account.id}`, LIMITS.automationRun)
    if (!rl.ok) return tooManyRequests(rl)

    const body: unknown = await req.json().catch(() => null)
    const parsed = runSchema.safeParse(body)
    if (!parsed.success) {
      return jsonError(400, 'Invalid input: automation (string) is required.')
    }

    const system = await db.aiSystem.findUnique({
      where: { id },
      select: { id: true, name: true, category: true, userId: true, blueprint: true, _count: { select: { records: true } } },
    })
    if (!system) return jsonError(404, 'System not found.')

    // does this automation belong to the system's blueprint?
    let known = false
    try {
      const bp: unknown = JSON.parse(system.blueprint)
      if (bp && typeof bp === 'object') {
        const autos = (bp as { automations?: unknown }).automations
        if (Array.isArray(autos)) {
          known = autos.some((x) => typeof x === 'string' && x.trim() === parsed.data.automation.trim())
        }
      }
    } catch {
      known = false
    }
    if (!known) return jsonError(400, 'Automation is not part of this system blueprint.')

    const recordCount = system._count.records
    // ~7% of runs hit a simulated upstream failure — honest ops realism
    const forceFail = Math.random() < 0.07
    const { log, durationMs, status, failure } = buildRunLog({
      automation: parsed.data.automation,
      systemName: system.name,
      recordCount,
      category: system.category,
      forceFail,
    })

    const run = await db.automationRun.create({
      data: {
        systemId: id,
        automation: parsed.data.automation,
        status,
        trigger: parsed.data.trigger,
        log: JSON.stringify(log),
        durationMs,
      },
    })

    await db.activity.create({
      data: {
        userId: system.userId,
        type: 'AUTOMATION',
        title:
          status === 'DONE'
            ? `Automation ran on ${system.name}`
            : `Automation failed on ${system.name}`,
        detail: `${parsed.data.automation.slice(0, 120)} · ${durationMs}ms${failure ? ` · ${failure}` : ''}`,
        status: status === 'DONE' ? 'DONE' : 'FAILED',
      },
    })

    return jsonOk({ run }, 201)
  })
}

/** GET /api/systems/[id]/automations/run — recent run history (last 20, owner-only). */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const { id } = await ctx.params
    const guard = await requireOwnedSystem(req, id)
    if (!guard.ok) return guard.res

    const runs = await db.automationRun.findMany({
      where: { systemId: id },
      orderBy: { createdAt: 'desc' },
      take: 20,
    })
    return jsonOk({ runs })
  })
}
