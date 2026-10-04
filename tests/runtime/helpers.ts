import { InMemoryTaskStore } from '@/server/runtime/memory-store';
import { FakeERPConnector } from '@/server/erp/fake-connector';
import { ExecutorDeps } from '@/server/runtime/executor';

export function makeDeps(overrides: Partial<ExecutorDeps> = {}): ExecutorDeps {
  return {
    store: new InMemoryTaskStore(),
    connector: new FakeERPConnector(),
    ...overrides,
  };
}

export const VALID_INPUT = {
  customerId: 'cust-1',
  lines: [{ description: 'Consulting services', quantity: 2, unitPrice: 100 }],
};

export const TENANT_A = 'tenant-a';
export const TENANT_B = 'tenant-b';
export const ACTOR = 'actor-1';
export const HUMAN_APPROVER = 'human-approver-1';
