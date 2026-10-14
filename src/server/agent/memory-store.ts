import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { PrismaClient } from '@prisma/client';

export const memoryCategorySchema = z.enum(['preference', 'confirmed_work_context']);
export type MemoryCategory = z.infer<typeof memoryCategorySchema>;

export const memoryInputSchema = z.object({
  key: z.string().trim().min(1).max(80).regex(/^[\p{L}\p{N} _.-]+$/u),
  value: z.string().trim().min(1).max(500),
  category: memoryCategorySchema,
}).strict();

export type MemoryItem = {
  id: string;
  tenantId: string;
  actorId: string;
  key: string;
  value: string;
  category: MemoryCategory;
  source: 'explicit_user_confirmation';
  confirmedBy: string;
  createdAt: Date;
  updatedAt: Date;
};

export type MemoryPatch = Partial<Pick<MemoryItem, 'key' | 'value' | 'category'>>;

function normalizeKey(key: string): string {
  return key.trim().toLocaleLowerCase().replace(/\s+/g, '_');
}

/** Memory writes exist only behind an explicit authenticated user action. */
export class PrismaMemoryStore {
  constructor(private readonly prisma: PrismaClient) {}

  async list(tenantId: string, actorId: string): Promise<MemoryItem[]> {
    return this.prisma.agentMemory.findMany({
      where: { tenantId, actorId },
      orderBy: [{ category: 'asc' }, { key: 'asc' }],
    }) as Promise<MemoryItem[]>;
  }

  async remember(
    tenantId: string,
    actorId: string,
    input: z.input<typeof memoryInputSchema>,
  ): Promise<MemoryItem> {
    const parsed = memoryInputSchema.parse(input);
    const key = normalizeKey(parsed.key);
    const scope = { tenantId_actorId_key: { tenantId, actorId, key } };
    return this.prisma.agentMemory.upsert({
      where: scope,
      create: {
        id: randomUUID(), tenantId, actorId, key, value: parsed.value, category: parsed.category,
        source: 'explicit_user_confirmation', confirmedBy: actorId,
      },
      update: { value: parsed.value, category: parsed.category, source: 'explicit_user_confirmation', confirmedBy: actorId },
    }) as Promise<MemoryItem>;
  }

  async update(tenantId: string, actorId: string, memoryId: string, patch: MemoryPatch): Promise<MemoryItem> {
    const parsed = memoryInputSchema.partial().strict().parse(patch);
    if (Object.keys(parsed).length === 0) throw new Error('At least one memory field must be updated.');
    const data = {
      ...(parsed.key === undefined ? {} : { key: normalizeKey(parsed.key) }),
      ...(parsed.value === undefined ? {} : { value: parsed.value }),
      ...(parsed.category === undefined ? {} : { category: parsed.category }),
    };
    const updated = await this.prisma.agentMemory.updateMany({ where: { id: memoryId, tenantId, actorId }, data });
    if (updated.count !== 1) throw new Error('Memory item was not found in this workspace.');
    const item = await this.prisma.agentMemory.findFirst({ where: { id: memoryId, tenantId, actorId } });
    if (!item) throw new Error('Memory item was not found in this workspace.');
    return item as MemoryItem;
  }

  async forget(tenantId: string, actorId: string, memoryId: string): Promise<void> {
    await this.prisma.agentMemory.deleteMany({ where: { id: memoryId, tenantId, actorId } });
  }
}
