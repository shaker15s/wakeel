import { describe, expect, it } from 'vitest';
import { FakeERPConnector } from '@/server/erp/fake-connector';
import { runConversationTurn } from '@/server/agent/conversation-runtime';
import type { ModelProvider, ModelTurnInput, ModelTurnOutput } from '@/server/agent/model-provider';
import { InMemoryTaskStore } from '@/server/runtime/memory-store';
import { advanceDraftVendorBill, createDraftVendorBillTask } from '@/server/runtime/vendor-bill-executor';

class OneTurnProvider implements ModelProvider {
  private outputs: ModelTurnOutput[] = [
    { type: 'tool_calls', calls: [{ callId: 'bill-call', name: 'create_draft_vendor_bill', arguments: { vendorId: 'vendor-1', vendorBillReference: 'SUP-E2E-1', billDate: '2026-03-01', currency: 'EGP', lines: [{ description: 'Printer paper', quantity: '3', unitPrice: '22.50' }] } }] },
    { type: 'message', text: 'A draft needs your review.' },
  ];
  async completeTurn(_input: ModelTurnInput): Promise<ModelTurnOutput> { return this.outputs.shift() ?? { type: 'message', text: 'No further verified answer.' }; }
}

describe('AI request to approved vendor-bill receipt', () => {
  it('creates no ERP record until the exact durable approval is decided', async () => {
    const connector = new FakeERPConnector(); const store = new InMemoryTaskStore();
    const result = await runConversationTurn({
      tenantId: 'account-e2e', actorId: 'operator-e2e', conversationId: 'conversation-e2e', userMessage: 'Create vendor bill SUP-E2E-1', lang: 'en',
      provider: new OneTurnProvider(), connector,
      createDurableTask: async (toolName, input) => {
        if (toolName !== 'create_draft_vendor_bill') return null;
        const deps = { store, connector };
        const task = await createDraftVendorBillTask(deps, { tenantId: 'account-e2e', actorId: 'operator-e2e', input });
        const pending = await advanceDraftVendorBill(deps, 'account-e2e', task.id);
        return { taskId: task.id, status: pending.status, workflowType: task.workflowType };
      },
    });
    expect(result.status).toBe('waiting_for_approval');
    expect(result.taskIds).toHaveLength(1);
    expect(connector.getCreatedVendorBills()).toHaveLength(0);

    const taskId = result.taskIds[0];
    const steps = await store.listSteps('account-e2e', taskId);
    const approvalId = (steps.find((step) => step.name === 'await_approval')!.output as { approvalId: string }).approvalId;
    await expect(advanceDraftVendorBill({ store, connector }, 'other-tenant', taskId)).rejects.toThrow();
    await store.decideApproval('account-e2e', approvalId, 'approved', 'operator-e2e');
    const final = await advanceDraftVendorBill({ store, connector }, 'account-e2e', taskId);
    expect(final).toMatchObject({ status: 'succeeded', result: { receipt: { documentKind: 'vendor_bill', partnerRole: 'vendor', currency: 'EGP', verifiedTotal: '67.50', verificationSource: 'custom' } } });
    expect(connector.getCreatedVendorBills()).toHaveLength(1);
  });
});
