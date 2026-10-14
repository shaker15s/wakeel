"use client";

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Clock3, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { decideAccountingTask, getAccountingTask } from '@/lib/api-client';

export function AccountingTaskApprovalPanel({ userId, taskId, lang, onClose }: { userId: string; taskId: string; lang: 'ar' | 'en'; onClose: () => void }) {
  const ar = lang === 'ar';
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['accounting-task', userId, taskId], queryFn: () => getAccountingTask(userId, taskId), refetchInterval: (result) => result.state.data?.task.pendingApproval ? 5_000 : false });
  const decision = useMutation({
    mutationFn: (value: 'approved' | 'rejected') => {
      const approvalId = query.data?.task.pendingApproval?.id;
      if (!approvalId) throw new Error('This approval is no longer pending.');
      return decideAccountingTask(userId, taskId, approvalId, value);
    },
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['accounting-task', userId, taskId] }); },
    onError: (error: Error) => toast.error(error.message),
  });
  const task = query.data?.task;
  if (!task && query.isPending) return <section dir={ar ? 'rtl' : 'ltr'} className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">{ar ? 'جارٍ تحميل طلب الموافقة…' : 'Loading approval task…'}</section>;
  if (!task) return null;
  const approval = task.pendingApproval;
  const details = approval?.normalizedParams ?? task.input;

  return (
    <section dir="auto" className="rounded-xl border border-gold/40 bg-card p-4 shadow-sm" aria-labelledby="accounting-task-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id="accounting-task-heading" className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Clock3 className="size-4 text-gold" /> {task.workflowType === 'create_draft_vendor_bill' ? (ar ? 'مسودة فاتورة مورد' : 'Vendor bill draft') : (ar ? 'مسودة فاتورة عميل' : 'Customer invoice draft')} · {task.status}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">{approval?.summary ?? task.result?.summary ?? `Task ${task.id}`}</p>
        </div>
        <Button type="button" variant="ghost" size="icon" aria-label={ar ? 'إغلاق تفاصيل المهمة' : 'Close task details'} onClick={onClose}><X className="size-4" /></Button>
      </div>
      <p className="mt-3 text-xs font-medium text-muted-foreground">{ar ? 'راجع بيانات الإجراء كما ستُرسل إلى نظام الشركة:' : 'Review the exact action payload before approving:'}</p>
      {approval ? <p className="mt-1 text-xs text-muted-foreground">{ar ? 'الموافقة تنشئ مسودة غير مُرحّلة فقط؛ لا يوجد ترحيل أو دفع.' : 'Approval creates an unposted draft only; it does not post or pay.'}</p> : null}
      <pre className="mt-2 max-h-40 overflow-auto rounded-md border border-border/70 bg-background p-3 text-xs text-foreground" dir="auto">{JSON.stringify(details, null, 2)}</pre>
      {approval ? <p className="mt-2 break-all font-mono text-[10px] text-muted-foreground">{ar ? 'بصمة الإجراء:' : 'Action hash:'} {approval.actionHash}</p> : null}
      {approval ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" size="sm" disabled={decision.isPending} onClick={() => decision.mutate('approved')}><Check className="mr-1.5 size-3.5" />{ar ? 'اعتماد هذه المسودة' : 'Approve exact draft'}</Button>
          <Button type="button" size="sm" variant="outline" disabled={decision.isPending} onClick={() => decision.mutate('rejected')}><X className="mr-1.5 size-3.5" />{ar ? 'رفض' : 'Reject'}</Button>
        </div>
      ) : task.result?.receipt ? (
        <p className="mt-3 text-xs text-emerald-600">{ar ? 'تم التحقق من' : 'Verified'} {task.result.receipt.documentKind} {task.result.receipt.erpRecordId} · {task.result.receipt.verifiedTotal ?? (ar ? 'المبلغ غير متاح' : 'amount unavailable')} {task.result.receipt.currency ?? ''} · {task.result.receipt.verificationSource}</p>
      ) : null}
    </section>
  );
}
