import { resolve } from "node:path";
import { SqliteTaskStore } from "./sqlite-store";
import {
  FakeERPConnector,
  type FakeInvoiceRecord,
} from "@/server/erp/fake-connector";

/** Local demo only. One Node process, persistent disk; no live ERP credentials.
 * Both runtime state and synthetic ERP writes survive process restarts.
 * This is not a queue, scheduler, production auth, or distributed runtime. */
const shared = globalThis as unknown as {
  __wakeelLocalRuntime?: {
    store: SqliteTaskStore;
    connector: FakeERPConnector;
  };
  __wakeelDemoQueue?: Promise<unknown>;
};
export function getDemoExecutorDeps() {
  if (!shared.__wakeelLocalRuntime) {
    const store = new SqliteTaskStore(
      process.env.WAKEEL_RUNTIME_DB ||
        resolve(process.cwd(), "data/runtime.sqlite"),
    );
    const connector = new FakeERPConnector(
      store.readFixture<FakeInvoiceRecord[]>("erp") ?? [],
      (records) => store.writeFixture("erp", records),
    );
    shared.__wakeelLocalRuntime = { store, connector };
  }
  return shared.__wakeelLocalRuntime;
}
/** Serialize all demo mutations, including fault injection and cancellation.
 * Single-process guarantee only; never launch multiple replicas with this API. */
export function withDemoMutation<T>(operation: () => Promise<T>): Promise<T> {
  const current = (shared.__wakeelDemoQueue ?? Promise.resolve()).then(
    operation,
  );
  shared.__wakeelDemoQueue = current.catch(() => undefined);
  return current;
}
export const DEMO_ACTOR_ID = "demo-operator";
