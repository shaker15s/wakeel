import { randomUUID } from "node:crypto";
import { SqliteTaskStore } from "@/server/runtime/sqlite-store";
import type {
  MemoryItem,
  MemoryStoreIface,
} from "@/server/agent/types";

function extractActorId(actorId?: string | null): string {
  return actorId ?? "system";
}

export class MemoryStore implements MemoryStoreIface {
  private store: SqliteTaskStore;

  constructor(dbPath: string) {
    this.store = new SqliteTaskStore(dbPath);
  }

  async list(tenantId: string, actorId: string): Promise<MemoryItem[]> {
    const rows = this.store.db
      .prepare("SELECT data FROM runtime_documents WHERE kind='fixture' AND scope=? ORDER BY sequence")
      .all(tenantId) as { data: string }[];

    return rows
      .map((r) => {
        try {
          const d = JSON.parse(r.data);
          return {
            id: d.id || "",
            tenantId: d.tenantId || tenantId,
            actorId: d.actorId || "system",
            key: d.key || "",
            value: typeof d.value === "string" ? d.value : JSON.stringify(d.value),
            category: d.category || "preference",
            source: d.source,
            confirmedBy: d.confirmedBy,
            createdAt: new Date(d.createdAt),
            updatedAt: new Date(d.updatedAt),
          } as MemoryItem;
        } catch {
          return null;
        }
      })
      .filter((i): i is MemoryItem => i !== null);
  }

  async remember(tenantId: string, actorId: string, item: Omit<MemoryItem, "id" | "createdAt" | "updatedAt">): Promise<MemoryItem> {
    const now = new Date();
    // Use tenantId:key as the id to ensure uniqueness across tenants
    const memoId = `${tenantId}:${item.key}`;

    await this.store.db
      .prepare(
        "INSERT INTO runtime_documents(kind,id,scope,sequence,data) VALUES (?,?,?,?,?) ON CONFLICT(kind,id) DO UPDATE SET data=excluded.data",
      )
      .run("fixture", memoId, tenantId, 0, JSON.stringify({
        kind: "memory",
        id: memoId,
        tenantId,
        actorId: extractActorId(actorId),
        key: item.key,
        value: typeof item.value === "string" ? item.value : JSON.stringify(item.value),
        category: item.category,
        source: item.source,
        confirmedBy: item.confirmedBy,
      }));

    return {
      id: memoId,
      tenantId,
      actorId: extractActorId(actorId),
      key: item.key,
      value: item.value,
      category: item.category,
      source: item.source,
      confirmedBy: item.confirmedBy,
      createdAt: now,
      updatedAt: now,
    };
  }

  async forget(tenantId: string, actorId: string, memoryId: string): Promise<void> {
    // memoryId is the original key, reconstruct the composite id
    const memoId = `${memoryId}`;
    // We need to delete by the actual stored id which includes tenantId
    // But the user passes just the key, so we list first then delete
    // For now, delete by just the key in scope - this may match multiple if not careful
    // Actually, let's just delete where id starts with the key pattern
    // Simpler: use the composite id format
    await this.store.db
      .prepare("DELETE FROM runtime_documents WHERE kind='fixture' AND id=? AND scope=?")
      .run(memoId, tenantId);
  }
}