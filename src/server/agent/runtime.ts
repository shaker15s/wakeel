import { runConversationTurn } from './conversation-runtime';
import type { ModelProvider } from './model-provider';
import type { IERPConnector } from '../erp/contract';
import type { MemoryItem } from './memory-store';

export interface AgentRunContext {
  operatorId: string;
  operatorName: string;
  workspaceName: string;
  lang: 'ar' | 'en';
  connector?: IERPConnector | null;
  provider?: ModelProvider;
  conversationId?: string;
  memories?: MemoryItem[];
  tenantId?: string;
  createDurableTask?: (toolName: string, input: unknown) => Promise<{ taskId: string; status: string; approvalId?: string; workflowType: string } | null>;
}

export interface AgentRunResponse {
  reply: string;
  executedTools: Array<{ name: string; result: { status: string; reason?: string } }>;
  status: 'answered' | 'waiting_for_approval' | 'review_required' | 'failed';
  taskIds: string[];
  evidence: Array<{ provider: string; auditId: string; observedAt: string }>;
}

/** The chat route and tests share the same bounded, schema-validated tool loop. */
export class AgentRuntime {
  static async run(
    userMessage: string,
    history: Array<{ role: 'user' | 'assistant'; content: string }>,
    ctx: AgentRunContext,
  ): Promise<AgentRunResponse> {
    const lang = ctx.lang === 'ar' || /[\u0600-\u06FF]/.test(userMessage) ? 'ar' : 'en';
    if (!ctx.connector) {
      return {
        reply: lang === 'ar'
          ? `أهلاً بك يا ${ctx.operatorName}. أستطيع مساعدتك في تنظيم العمل، لكن يلزم ربط نظام ERP لاستعراض البيانات المالية الحية.`
          : `Welcome ${ctx.operatorName}. I can help organize the work, but an ERP connection is required to read live financial data.`,
        executedTools: [], status: 'review_required', taskIds: [], evidence: [],
      };
    }

    const result = await runConversationTurn({
      tenantId: ctx.tenantId ?? ctx.operatorId,
      actorId: ctx.operatorId,
      conversationId: ctx.conversationId ?? 'current-conversation',
      userMessage,
      lang,
      operatorName: ctx.operatorName,
      workspaceName: ctx.workspaceName,
      memories: ctx.memories,
      history,
      connector: ctx.connector,
      provider: ctx.provider,
      createDurableTask: ctx.createDurableTask,
    });

    return {
      reply: result.reply,
      executedTools: result.toolTrace.map(({ name, status, reason }) => ({ name, result: { status, ...(reason ? { reason } : {}) } })),
      status: result.status,
      taskIds: result.taskIds,
      evidence: result.evidence,
    };
  }
}
