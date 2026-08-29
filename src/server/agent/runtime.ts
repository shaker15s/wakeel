import { chatJSON, chatText } from '@/lib/wakeel/ai';
import { IERPConnector } from '../erp/contract';
import { ERP_TOOLS, executeToolCall } from './tools';

export interface AgentRunContext {
  operatorId: string;
  operatorName: string;
  workspaceName: string;
  lang: 'ar' | 'en';
  connector?: IERPConnector | null;
}

export interface AgentRunResponse {
  reply: string;
  executedTools: Array<{ name: string; result: any }>;
  approvalCard?: any;
}

/**
 * Wakeel Agent Runtime
 *
 * Execution loop:
 * User Request -> Understand Intent -> Tool Selection -> Policy Check -> Execute against real ERP -> Grounded Answer
 */
export class AgentRuntime {
  static async run(
    userMessage: string,
    history: Array<{ role: 'user' | 'assistant'; content: string }>,
    ctx: AgentRunContext
  ): Promise<AgentRunResponse> {
    const isArabic = ctx.lang === 'ar' || /[\u0600-\u06FF]/.test(userMessage);

    // If no ERP connector is active, guide the operator to connect Odoo
    if (!ctx.connector) {
      return {
        reply: isArabic
          ? `أهلاً بك يا ${ctx.operatorName}. للبدء في استعراض بياناتك الحقيقية ومبيعاتك، يرجى ربط حساب Odoo الخاص بك أولاً عبر نافذة الربط بالأعلى.`
          : `Welcome ${ctx.operatorName}. To access live data and sales, please connect your Odoo ERP using the connection tab above.`,
        executedTools: [],
      };
    }

    // 1. Tool Selection / Intent Extraction via Fast LLM
    const toolsPrompt = ERP_TOOLS.map((t) => `- ${t.name}: ${t.description}`).join('\n');
    const intentPrompt = `You are the reasoning core of Wakeel AI Employee.
Available ERP Tools:
${toolsPrompt}

Based on the operator's message, decide if an ERP tool should be called.
Return JSON format:
{
  "callTool": true | false,
  "toolName": "tool_name",
  "parameters": {}
}

Operator Message: "${userMessage}"`;

    const decision: any = await chatJSON(
      'You are a strict JSON tool decision engine.',
      intentPrompt
    );

    const executedTools: Array<{ name: string; result: any }> = [];
    let toolResultContext = '';
    let approvalCard: any = null;

    if (decision?.callTool && decision?.toolName) {
      const toolRes = await executeToolCall(
        ctx.connector,
        decision.toolName,
        decision.parameters || {},
        ctx.operatorId
      );

      if (toolRes?.requiresApproval) {
        approvalCard = toolRes.approvalCard;
        toolResultContext = `[Action requires operator confirmation: ${toolRes.reason}]`;
      } else {
        executedTools.push({ name: decision.toolName, result: toolRes });
        toolResultContext = `Real ERP Data from ${decision.toolName}:\n${JSON.stringify(toolRes, null, 2)}`;
      }
    }

    // 2. Synthesize Grounded Natural Response
    const synthesisSystemPrompt = `You are Wakeel (وكيل), an executive AI Employee operating ${ctx.workspaceName}'s real ERP for ${ctx.operatorName}.
RULES:
1. Speak warmly, professionally, and concisely.
2. ALWAYS use the real numbers and data provided below. NEVER invent or guess figures.
3. If an action requires approval, inform the operator to review and confirm the approval card.
4. Reply in ${isArabic ? 'Arabic (العربية)' : 'English'}.

${toolResultContext ? `--- REAL ERP VERIFIED DATA ---\n${toolResultContext}` : ''}`;

    const reply = await chatText(synthesisSystemPrompt, [
      ...history,
      { role: 'user', content: userMessage },
    ]);

    return {
      reply: reply || (isArabic ? 'تم مراجعة البيانات من نظام ERP الخاص بك.' : 'Checked your ERP data successfully.'),
      executedTools,
      approvalCard,
    };
  }
}
