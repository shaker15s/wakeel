import { z } from 'zod'
import { db } from '@/lib/db'
import { handleRoute, jsonError, jsonOk } from '@/lib/wakeel/http'
import { requireOwnedSystem } from '@/lib/auth'

/**
 * POST /api/systems/[id]/automations — wire a NEW automation into the system's
 * blueprint (AUTOMATION LAB "WIRE IT" action).
 *
 * Finds the automations array wherever the blueprint keeps it (top-level
 * `.automations` or `.entity.automations`), appends the new workflow if it is
 * not already present (case-insensitive), and logs an AUTOMATION ledger entry.
 */

const wireSchema = z.object({
  automation: z.string().trim().min(3).max(140),
})

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const { id } = await ctx.params
    const body: unknown = await req.json().catch(() => null)
    const parsed = wireSchema.safeParse(body)
    if (!parsed.success) {
      return jsonError(400, 'Invalid input: automation must be a 3-140 character workflow description.')
    }
    const automation = parsed.data.automation

    const guard = await requireOwnedSystem(req, id)
    if (!guard.ok) return guard.res
    const system = guard.system

    let blueprint: Record<string, unknown>
    try {
      const p: unknown = JSON.parse(system.blueprint)
      if (!p || typeof p !== 'object' || Array.isArray(p)) {
        return jsonError(400, 'This system has no structured blueprint to wire automations into.')
      }
      blueprint = p as Record<string, unknown>
    } catch {
      return jsonError(400, 'This system has no structured blueprint to wire automations into.')
    }

    // locate (or create) the canonical automations array
    const entity =
      blueprint.entity && typeof blueprint.entity === 'object' && !Array.isArray(blueprint.entity)
        ? (blueprint.entity as Record<string, unknown>)
        : null
    const targetIsTop = Array.isArray(blueprint.automations) || !entity || !Array.isArray(entity.automations)
    const target = targetIsTop
      ? blueprint
      : (entity as Record<string, unknown>)
    const current: string[] = Array.isArray(target.automations)
      ? (target.automations as unknown[]).filter((a): a is string => typeof a === 'string')
      : []

    const normalizedNew = automation.toLowerCase().replace(/\s+/g, ' ').trim()
    if (current.some((a) => a.toLowerCase().replace(/\s+/g, ' ').trim() === normalizedNew)) {
      return jsonError(409, 'That automation is already wired into this system.')
    }
    if (current.length >= 8) {
      return jsonError(409, 'This blueprint already carries 8 automations — archive one before wiring more.')
    }

    target.automations = [...current, automation]

    await db.aiSystem.update({
      where: { id: system.id },
      data: { blueprint: JSON.stringify(blueprint) },
    })

    await db.activity.create({
      data: {
        userId: system.userId,
        type: 'AUTOMATION',
        title: `Wired new automation into ${system.name}`,
        detail: automation,
        status: 'DONE',
      },
    })

    return jsonOk({ wired: automation, total: current.length + 1 }, 201)
  })
}
