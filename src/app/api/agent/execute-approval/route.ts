import { jsonError } from '@/lib/wakeel/http';

/**
 * Legacy approval endpoint retired. Financial writes must be approved against a
 * persisted task and exact action hash at /api/agent/tasks/[taskId]/approval.
 */
export async function POST() {
  return jsonError(410, 'This approval endpoint is retired. Use the persisted task approval workflow.');
}
