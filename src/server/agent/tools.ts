import { ExecutionResult, IERPConnector } from '../erp/contract';
import { z } from 'zod';
import { executeFinanceTool, FINANCE_TOOLS, resolveFinanceTool } from './tool-registry';

export interface ToolDefinition {
  name: string;
  description: string;
  category: 'READ' | 'DRAFT_WRITE' | 'FINANCIAL_COMMIT' | 'DESTRUCTIVE';
  parametersSchema: Record<string, any>;
}

export const ERP_TOOLS: ToolDefinition[] = FINANCE_TOOLS.map((tool) => ({
  name: tool.name,
  description: tool.description,
  category: tool.riskClass,
  parametersSchema: z.toJSONSchema(tool.inputSchema),
}));

/**
 * Discriminated-ish result shape for executeToolCall(). Every branch carries
 * the same keys (optional where not applicable) so callers can read
 * `.requiresApproval` / `.data` / `.reason` without narrowing first — this
 * used to be an implicit, inconsistent union that `tsc` could not check
 * (see docs/implementation/00-repo-audit.md, tsc baseline section).
 */
export type ToolCallResult =
  | { success: false; error: string; requiresApproval: false; data?: undefined; approvalCard?: undefined; reason?: undefined }
  | { success: false; requiresApproval: true; approvalCard: unknown; reason?: string; data?: undefined; error?: undefined }
  | (ExecutionResult<any> & { requiresApproval?: false; approvalCard?: undefined; reason?: undefined });

export async function executeToolCall(
  connector: IERPConnector,
  toolName: string,
  parameters: Record<string, any>,
  operatorId: string,
  approvalGranted = false
): Promise<ToolCallResult> {
  const tool = resolveFinanceTool(toolName);
  if (!tool) return { success: false, error: 'Tool is not registered.', requiresApproval: false };
  const parsed = tool.inputSchema.safeParse(parameters);
  if (!parsed.success) return { success: false, error: 'Tool arguments are invalid.', requiresApproval: false };

  let status;
  try {
    status = await connector.testConnection();
  } catch {
    return { success: false, error: 'ERP capabilities could not be verified.', requiresApproval: false };
  }
  if (!status.healthy || !status.authenticated) {
    return { success: false, error: 'ERP connection is not healthy or authenticated.', requiresApproval: false };
  }

  const result = await executeFinanceTool({
    connector,
    operatorId,
    capabilities: status.permissions,
    approvalGranted,
  }, toolName, parsed.data);

  if (result.status === 'approval_required') {
    return { success: false, requiresApproval: true, approvalCard: result.approval };
  }
  if (result.status !== 'succeeded') {
    return { success: false, error: result.reason, requiresApproval: false };
  }
  return { ...(result.data as ExecutionResult), requiresApproval: false };
}
