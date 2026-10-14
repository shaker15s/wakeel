import type { TaskStore } from "./types";

// Serialize entrypoints for one task in one Node process. The WeakMap does not
// keep retired stores alive. Distributed deployments need DB-backed leases;
// this deliberately does not pretend a process mutex is a distributed lock.
const queues = new WeakMap<TaskStore, Map<string, Promise<unknown>>>();
export async function withTaskLock<T>(
  store: TaskStore,
  taskId: string,
  run: () => Promise<T>,
): Promise<T> {
  let tasks = queues.get(store);
  if (!tasks) {
    tasks = new Map();
    queues.set(store, tasks);
  }
  const current = (tasks.get(taskId) ?? Promise.resolve())
    .catch(() => undefined)
    .then(run);
  tasks.set(taskId, current);
  try {
    return await current;
  } finally {
    if (tasks.get(taskId) === current) tasks.delete(taskId);
  }
}
