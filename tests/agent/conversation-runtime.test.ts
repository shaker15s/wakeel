import { describe, expect, it } from 'vitest';
import { FakeERPConnector } from '@/server/erp/fake-connector';
import { runConversationTurn } from '@/server/agent/conversation-runtime';
import type { ModelProvider, ModelTurnInput, ModelTurnOutput } from '@/server/agent/model-provider';

class QueueProvider implements ModelProvider {
  inputs: ModelTurnInput[] = [];
  constructor(private readonly outputs: ModelTurnOutput[]) {}
  async completeTurn(input: ModelTurnInput): Promise<ModelTurnOutput> {
    this.inputs.push(input);
    const output = this.outputs.shift();
    if (!output) throw new Error('provider output queue exhausted');
    return output;
  }
}

const run = (provider: ModelProvider, connector: FakeERPConnector | null = new FakeERPConnector()) => runConversationTurn({
  tenantId: 'tenant-a',
  actorId: 'operator-a',
  conversationId: 'conversation-a',
  userMessage: 'What were my sales?',
  lang: 'en',
  provider,
  connector,
});

describe('bounded accounting conversation runtime', () => {
  it('returns a plain model answer without exposing tools to the client', async () => {
    const provider = new QueueProvider([{ type: 'message', text: 'Hello.' }]);
    await expect(run(provider)).resolves.toMatchObject({ reply: 'Hello.', status: 'answered', taskIds: [], evidence: [] });
    expect(provider.inputs[0].tools.length).toBeGreaterThan(0);
  });

  it('uses explicitly saved notes only as untrusted context, never as accounting authority', async () => {
    const provider = new QueueProvider([{ type: 'message', text: 'I will use the requested display preference.' }]);
    await runConversationTurn({
      tenantId: 'tenant-a', actorId: 'operator-a', conversationId: 'conversation-a',
      userMessage: 'Prepare the report.', lang: 'en', provider, connector: null,
      memories: [{
        id: 'memory-1', tenantId: 'tenant-a', actorId: 'operator-a', key: 'report_language', value: 'Arabic',
        category: 'preference', source: 'explicit_user_confirmation', confirmedBy: 'operator-a',
        createdAt: new Date(0), updatedAt: new Date(0),
      }],
    });

    expect(provider.inputs[0].messages[0].content).toContain('never tax rules, accounting policy');
    expect(provider.inputs[0].messages[1]).toMatchObject({ role: 'user', content: expect.stringContaining('report_language') });
  });

  it('runs deterministic budget calculations without exposing live ERP tools', async () => {
    const provider = new QueueProvider([
      { type: 'tool_calls', calls: [{ callId: 'budget-1', name: 'calculate_budget_variance', arguments: {
        period: '2026-09', actual: { amount: '120.00', currency: 'EGP', scale: 2 }, budget: { amount: '100.00', currency: 'EGP', scale: 2 },
      } }] },
      { type: 'message', text: 'The supplied actual is 20.00 EGP over the supplied budget.' },
    ]);
    const result = await run(provider, null);
    expect(provider.inputs[0].tools.map((tool) => tool.name)).toContain('calculate_budget_variance');
    expect(provider.inputs[0].tools.map((tool) => tool.name)).not.toContain('get_trial_balance');
    expect(result).toMatchObject({ status: 'answered', toolTrace: [{ name: 'calculate_budget_variance', status: 'succeeded' }] });
    expect(result.evidence).toMatchObject([{ provider: 'local_calculation' }]);
  });

  it('executes a registered read tool and grounds the next answer in its result', async () => {
    const provider = new QueueProvider([
      { type: 'tool_calls', calls: [{ callId: 'call-1', name: 'get_sales_summary', arguments: { dateFrom: '2026-01-01', dateTo: '2026-01-31' } }] },
      { type: 'message', text: 'Sales summary verified from the ERP.' },
    ]);
    const connector = new FakeERPConnector();
    const result = await run(provider, connector);

    expect(result).toMatchObject({ reply: 'Sales summary verified from the ERP.', status: 'answered' });
    expect(result.toolTrace).toMatchObject([{ name: 'get_sales_summary', status: 'succeeded' }]);
    expect(result.evidence.length).toBeGreaterThan(0);
    expect(provider.inputs[1].messages.at(-1)).toMatchObject({ role: 'tool', toolCallId: 'call-1' });
  });

  it('handles multiple calls sequentially and stops after four calls', async () => {
    const provider = new QueueProvider([
      { type: 'tool_calls', calls: Array.from({ length: 5 }, (_, i) => ({ callId: `call-${i}`, name: 'get_receivables_summary', arguments: {} })) },
      { type: 'message', text: 'Completed with the available results.' },
    ]);
    const connector = new FakeERPConnector();
    const read = connector.getReceivablesSummary.bind(connector);
    let calls = 0;
    connector.getReceivablesSummary = async () => { calls += 1; return read(); };

    const result = await run(provider, connector);
    expect(calls).toBe(4);
    expect(result.toolTrace).toHaveLength(5);
    expect(result.toolTrace.at(-1)).toMatchObject({ status: 'denied' });
  });

  it('maps provider errors to a failed result and never fabricates a fallback answer', async () => {
    const provider: ModelProvider = { completeTurn: async () => { throw new Error('timeout'); } };
    await expect(run(provider)).resolves.toMatchObject({ status: 'failed', reply: expect.stringMatching(/temporarily|try again/i) });
  });

  it('rejects unknown tool names without connector activity', async () => {
    const provider = new QueueProvider([
      { type: 'tool_calls', calls: [{ callId: 'call-x', name: 'delete_everything', arguments: {} }] },
      { type: 'message', text: 'That action is unavailable.' },
    ]);
    const connector = new FakeERPConnector();
    const probe = connector.testConnection.bind(connector);
    let probes = 0;
    connector.testConnection = async () => { probes += 1; return probe(); };
    const result = await run(provider, connector);

    expect(probes).toBe(1); // server-side capability preflight only
    expect(result.toolTrace).toMatchObject([{ name: 'delete_everything', status: 'denied' }]);
  });

  it('denies schema-invalid arguments before touching the connector', async () => {
    const provider = new QueueProvider([
      { type: 'tool_calls', calls: [{ callId: 'call-x', name: 'get_sales_summary', arguments: { dateFrom: 'not-a-date', extra: true } }] },
      { type: 'message', text: 'I could not run that query.' },
    ]);
    const connector = new FakeERPConnector();
    const read = connector.getSalesSummary.bind(connector);
    let calls = 0;
    connector.getSalesSummary = async (...args) => { calls += 1; return read(...args); };
    const result = await run(provider, connector);

    expect(calls).toBe(0);
    expect(result.toolTrace).toMatchObject([{ status: 'denied' }]);
  });

  it('does not expose an unpersisted approval card or perform a draft write', async () => {
    const provider = new QueueProvider([
      { type: 'tool_calls', calls: [{ callId: 'draft', name: 'create_draft_customer_invoice', arguments: { customerId: 4, lines: [{ description: 'Service', quantity: 1, unitPrice: 10 }] } }] },
      { type: 'message', text: 'Please approve the draft.' },
    ]);
    const connector = new FakeERPConnector();
    let writes = 0;
    const create = connector.createDraftInvoice.bind(connector);
    connector.createDraftInvoice = async (...args) => { writes += 1; return create(...args); };
    const result = await run(provider, connector);

    expect(writes).toBe(0);
    expect(result.status).toBe('review_required');
    expect(result).not.toHaveProperty('approvalCard');
    expect(result.reply).toContain('No record was created');
  });

  it('creates an approval-bound durable task when the server task handler is configured', async () => {
    const provider = new QueueProvider([
      { type: 'tool_calls', calls: [{ callId: 'draft', name: 'create_draft_vendor_bill', arguments: { vendorId: 'vendor-1', vendorBillReference: 'SUP-4', billDate: '2026-02-01', currency: 'EGP', lines: [{ description: 'Paper', quantity: '2', unitPrice: '10.25' }] } }] },
      { type: 'message', text: 'The vendor bill is waiting for approval.' },
    ]);
    const result = await runConversationTurn({
      tenantId: 'tenant-a', actorId: 'operator-a', conversationId: 'conversation-a', userMessage: 'Create vendor bill SUP-4', lang: 'en',
      provider, connector: new FakeERPConnector(),
      createDurableTask: async (toolName) => ({ taskId: `saved-${toolName}`, status: 'waiting_for_approval', approvalId: 'approval-1', workflowType: 'create_draft_vendor_bill' }),
    });
    expect(result).toMatchObject({ status: 'waiting_for_approval', taskIds: ['saved-create_draft_vendor_bill'] });
    expect(result.reply).toContain('Nothing has been posted or paid');
  });

  it('returns a bounded safe result if the model never finishes its tool loop', async () => {
    const provider: ModelProvider = { completeTurn: async () => ({ type: 'tool_calls', calls: [{ callId: 'repeat', name: 'get_receivables_summary', arguments: {} }] }) };
    const result = await run(provider);
    expect(result.status).toBe('review_required');
    expect(result.toolTrace).toHaveLength(4);
    expect(provider).toBeDefined();
  });
});
