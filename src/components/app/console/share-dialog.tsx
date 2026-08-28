"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Copy, Eye, Link2, Loader2, ShieldCheck, Share2, Unlink } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { timeAgo } from "@/components/app/bits";
import { MonoLabel } from "@/components/app/motion-bits";
import {
  createShareLink,
  getShareLink,
  revokeShareLink,
} from "@/lib/api-client";
import { useT } from "@/lib/i18n";
import { useWakeel } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * Owner-side share console: issue / inspect / revoke the secret read-only
 * link for one system. Rendered above the system-detail dialog.
 */
export function ShareDialog({
  systemId,
  systemName,
  open,
  onOpenChange,
}: {
  systemId: string | null;
  systemName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const lang = useWakeel((s) => s.lang);
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [armedRevoke, setArmedRevoke] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["share", systemId],
    queryFn: () => getShareLink(systemId!),
    enabled: !!systemId && open,
  });
  const share = data?.share ?? null;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["share", systemId] });
    queryClient.invalidateQueries({ queryKey: ["activity"] });
  };

  const create = useMutation({
    mutationFn: () => createShareLink(systemId!),
    onSuccess: (res) => {
      invalidate();
      toast.success(t.share.toastOk, {
        description: res.created ? t.share.toastOkDesc : undefined,
      });
    },
    onError: (err: Error) =>
      toast.error(t.share.toastErr, { description: err.message }),
  });

  const revoke = useMutation({
    mutationFn: () => revokeShareLink(systemId!),
    onSuccess: () => {
      invalidate();
      setArmedRevoke(false);
      toast.success(t.share.toastRevokeOk, {
        description: t.share.toastRevokeOkDesc,
      });
    },
    onError: (err: Error) =>
      toast.error(t.share.toastErr, { description: err.message }),
  });

  // reset transient state whenever the dialog re-opens / target changes
  const [prevKey, setPrevKey] = useState(`${systemId}:${open}`);
  if (prevKey !== `${systemId}:${open}`) {
    setPrevKey(`${systemId}:${open}`);
    setCopied(false);
    setArmedRevoke(false);
  }

  useEffect(() => {
    return () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    };
  }, []);

  const copy = async () => {
    if (!share) return;
    try {
      const url = `${window.location.origin}/${share.url}`;
      await navigator.clipboard.writeText(url);
      setCopied(true);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error(t.share.toastErr, { description: share.url });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        className="border-border bg-card sm:max-w-md"
      >
        <DialogTitle className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.16em] text-gold">
          <Share2 className="size-3.5" />
          {t.share.panelTitle}
        </DialogTitle>

        <p className="text-[13px] leading-relaxed text-muted-foreground">
          {t.share.panelDesc}
        </p>

        {systemName && (
          <p dir="auto" className="truncate font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground/60">
            {systemName}
          </p>
        )}

        {isLoading ? (
          <div className="flex flex-col gap-2.5 py-1">
            <Skeleton className="h-10 w-full rounded-sm" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-9 w-full rounded-sm" />
          </div>
        ) : share ? (
          <div className="flex flex-col gap-3.5">
            {/* link box */}
            <div className="flex flex-col gap-1.5">
              <MonoLabel className="text-[9px]">{t.share.linkLabel}</MonoLabel>
              <div className="flex items-stretch gap-1.5">
                <div
                  dir="ltr"
                  className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-sm border border-gold/25 bg-gold/5 px-3 font-mono text-[11px] text-gold"
                >
                  <Link2 className="size-3.5 shrink-0 text-gold/60" />
                  <span className="truncate">{share.url}</span>
                </div>
                <Button
                  type="button"
                  onClick={copy}
                  className={cn(
                    "h-10 w-[92px] shrink-0 font-mono text-[10px] uppercase tracking-[0.12em]",
                    copied
                      ? "bg-[#3ECF8E]/15 text-[#3ECF8E] hover:bg-[#3ECF8E]/25"
                      : "bg-gold text-[#0A0908] hover:bg-gold-pale"
                  )}
                >
                  {copied ? (
                    <>
                      <Check className="size-3.5" />
                      {t.share.copied}
                    </>
                  ) : (
                    <>
                      <Copy className="size-3.5" />
                      {t.share.copy}
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* meta row */}
            <div className="flex items-center gap-4 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
              <span className="flex items-center gap-1.5" dir="ltr">
                <Eye className="size-3.5 text-gold/70" />
                {t.share.views(share.views)}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-1.5 animate-pulse rounded-full bg-[#3ECF8E]" />
                {t.share.issuedLabel} {timeAgo(share.createdAt, lang)}
              </span>
            </div>

            {/* revoke zone */}
            <div className="flex items-center justify-between gap-2 rounded-sm border border-destructive/25 bg-destructive/5 px-3 py-2.5">
              <AnimatePresence mode="wait" initial={false}>
                {armedRevoke ? (
                  <motion.span
                    key="armed"
                    initial={{ opacity: 0, y: 3 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -3 }}
                    className="font-mono text-[10px] uppercase tracking-[0.12em] text-destructive"
                  >
                    {t.share.revokedNote}
                  </motion.span>
                ) : (
                  <motion.span
                    key="note"
                    initial={{ opacity: 0, y: 3 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -3 }}
                    className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground"
                  >
                    <ShieldCheck className="size-3.5 text-gold/70" />
                    {t.share.footerNote}
                  </motion.span>
                )}
              </AnimatePresence>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={revoke.isPending}
                onClick={() => {
                  if (armedRevoke) {
                    revoke.mutate();
                  } else {
                    setArmedRevoke(true);
                  }
                }}
                onBlur={() => setArmedRevoke(false)}
                className={cn(
                  "h-8 shrink-0 font-mono text-[10px] uppercase tracking-[0.12em]",
                  armedRevoke
                    ? "bg-destructive text-white hover:bg-destructive/90"
                    : "text-destructive hover:bg-destructive/10 hover:text-destructive"
                )}
              >
                {revoke.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Unlink className="size-3.5" />
                )}
                {armedRevoke ? t.share.revoke : t.share.revoke}
              </Button>
            </div>
          </div>
        ) : (
          /* empty — no link yet */
          <div className="flex flex-col items-center gap-4 rounded-lg border border-dashed border-gold/25 bg-gold/[0.03] px-6 py-8 text-center">
            <pre
              aria-hidden
              className="select-none font-mono text-[11px] leading-[1.5] text-gold/50"
              dir="ltr"
            >
              {`  ╭───────────╮
  │  🔗 → ○ ○  │
  │  READ ONLY │
  ╰───────────╯`}
            </pre>
            <Button
              type="button"
              onClick={() => create.mutate()}
              disabled={create.isPending}
              className="h-10 bg-gold font-mono text-[10px] uppercase tracking-[0.14em] text-[#0A0908] hover:bg-gold-pale"
            >
              {create.isPending ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  {t.share.issuing}
                </>
              ) : (
                <>
                  <Link2 className="size-3.5" />
                  {t.share.issue}
                </>
              )}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
