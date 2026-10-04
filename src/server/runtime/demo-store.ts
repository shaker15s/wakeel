import { InMemoryTaskStore } from './memory-store';
import { FakeERPConnector } from '@/server/erp/fake-connector';
import { ExecutorDeps } from './executor';

/**
 * Process-wide singleton for the `/api/demo/*` routes — a sandboxed,
 * no-login, no-real-ERP playground for the create_draft_invoice runtime
 * built in Milestone 1.
 *
 * Deliberately NOT the same store a real authenticated route would use:
 * this exists because the real app's Prisma client cannot be generated in
 * this sandbox (no network access to binaries.prisma.sh — confirmed in
 * docs/implementation/00-repo-audit.md and re-confirmed when wiring this
 * demo), so there is currently no way to exercise the runtime end-to-end
 * through the real, authenticated, database-backed app in this environment.
 * This demo proves the runtime behaves correctly over HTTP without
 * depending on either Prisma or a live Odoo instance — both genuinely
 * unavailable here, per the user's own confirmation.
 *
 * Uses the same `globalThis`-caching trick as `src/lib/db.ts` so the
 * in-memory data survives Next.js dev-server hot reloads within one
 * process, but — same caveat as any in-memory store — resets on a real
 * process restart. That is fine for a demo; it is explicitly NOT fine for
 * production (see docs/adr/0001-in-process-durable-execution.md).
 */
const globalForDemo = globalThis as unknown as {
  __wakeelDemoStore?: InMemoryTaskStore;
  __wakeelDemoConnector?: FakeERPConnector;
};

export function getDemoExecutorDeps(): ExecutorDeps {
  if (!globalForDemo.__wakeelDemoStore) {
    globalForDemo.__wakeelDemoStore = new InMemoryTaskStore();
  }
  if (!globalForDemo.__wakeelDemoConnector) {
    globalForDemo.__wakeelDemoConnector = new FakeERPConnector();
  }
  return {
    store: globalForDemo.__wakeelDemoStore,
    connector: globalForDemo.__wakeelDemoConnector,
  };
}

export const DEMO_TENANT_COOKIE = 'wakeel_demo_tenant';
export const DEMO_ACTOR_ID = 'demo-operator';
