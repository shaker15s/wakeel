"use client";

import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MonoLabel } from "@/components/app/motion-bits";
import { createUser } from "@/lib/api-client";
import { useT } from "@/lib/i18n";
import { useWakeel } from "@/lib/store";
import { importWorkspaceFile } from "@/lib/workspace-import";

interface FormState {
  name: string;
  workspace: string;
  role: string;
}

interface FormErrors {
  name?: string;
  workspace?: string;
}

export function OnboardingDialog() {
  const t = useT();
  const open = useWakeel((s) => s.onboardingOpen);
  const setOpen = useWakeel((s) => s.setOnboardingOpen);
  const setUserId = useWakeel((s) => s.setUserId);
  const setView = useWakeel((s) => s.setView);
  const setConsoleTab = useWakeel((s) => s.setConsoleTab);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  const [form, setForm] = useState<FormState>({
    name: "",
    workspace: "",
    role: "",
  });
  const [errors, setErrors] = useState<FormErrors>({});

  const mutation = useMutation({
    mutationFn: (body: { name: string; workspace: string; role?: string }) =>
      createUser(body),
    onSuccess: (data) => {
      setUserId(data.user.id); // persists to localStorage wakeel:user
      setView("console");
      setOpen(false);
      toast.success(t.onb.toastOk, {
        description: t.onb.toastOkDesc(data.user.name.split(" ")[0]),
      });
    },
    onError: (err: Error) => {
      toast.error(t.onb.toastErr, { description: err.message });
    },
  });

  const validate = (): boolean => {
    const next: FormErrors = {};
    if (!form.name.trim()) next.name = t.onb.errName;
    else if (form.name.trim().length < 2) next.name = t.onb.errShort;
    if (!form.workspace.trim()) next.workspace = t.onb.errWs;
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    mutation.mutate({
      name: form.name.trim(),
      workspace: form.workspace.trim(),
      ...(form.role ? { role: form.role } : {}),
    });
  };

  /** restore a workspace export instead of creating a throwaway operator */
  const handleImportFile = async (file: File) => {
    if (importing || mutation.isPending) return;
    setImporting(true);
    try {
      const res = await importWorkspaceFile(file);
      if (!res.ok) {
        if (res.reason === "invalid") {
          toast.error(t.sb.importInvalid);
        } else {
          toast.error(t.sb.importErr, { description: res.message });
        }
        return;
      }
      setUserId(res.userId);
      setView("console");
      setConsoleTab("systems");
      setOpen(false);
      toast.success(t.sb.importTitle, {
        description: t.sb.importDesc(res.systems, res.records),
      });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!mutation.isPending) setOpen(o);
      }}
    >
      <DialogContent className="max-w-md border-border bg-card p-0" showCloseButton={!mutation.isPending}>
        <div className="relative overflow-hidden">
          <div className="bg-blueprint pointer-events-none absolute inset-0 opacity-60" />
          <div className="relative p-6 sm:p-8">
            <DialogHeader className="gap-3 text-start">
              <MonoLabel gold className="animate-blink">
                {t.onb.badge}
              </MonoLabel>
              <DialogTitle className="font-display text-2xl font-bold tracking-tight">
                {t.onb.title}
              </DialogTitle>
              <DialogDescription>
                {t.onb.desc}
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={submit} className="mt-6 flex flex-col gap-4" noValidate>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="op-name" className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  {t.onb.fullName}
                </Label>
                <Input
                  id="op-name"
                  placeholder={t.onb.namePh}
                  autoComplete="name"
                  value={form.name}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, name: e.target.value }));
                    if (errors.name) setErrors((er) => ({ ...er, name: undefined }));
                  }}
                  aria-invalid={!!errors.name}
                  className="h-10 border-border bg-secondary/60 focus-visible:ring-gold/50"
                />
                {errors.name && (
                  <p className="font-mono text-[11px] text-destructive">
                    ⚠ {errors.name}
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="op-workspace" className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  {t.onb.workspace}
                </Label>
                <Input
                  id="op-workspace"
                  placeholder={t.onb.wsPh}
                  value={form.workspace}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, workspace: e.target.value }));
                    if (errors.workspace)
                      setErrors((er) => ({ ...er, workspace: undefined }));
                  }}
                  aria-invalid={!!errors.workspace}
                  className="h-10 border-border bg-secondary/60 focus-visible:ring-gold/50"
                />
                {errors.workspace && (
                  <p className="font-mono text-[11px] text-destructive">
                    ⚠ {errors.workspace}
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <Label className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  {t.onb.role}
                </Label>
                <Select
                  value={form.role}
                  onValueChange={(v) => setForm((f) => ({ ...f, role: v }))}
                >
                  <SelectTrigger className="h-10 w-full border-border bg-secondary/60 data-[placeholder]:text-muted-foreground">
                    <SelectValue placeholder={t.onb.rolePh} />
                  </SelectTrigger>
                  <SelectContent className="border-border bg-popover">
                    {t.onb.roles.map((role) => (
                      <SelectItem key={role} value={role}>
                        {role}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button
                type="submit"
                disabled={mutation.isPending || importing}
                className="mt-2 h-11 w-full bg-primary font-mono text-[12px] font-medium uppercase tracking-[0.14em] text-primary-foreground hover:bg-gold-pale"
              >
                {mutation.isPending ? (
                  <>
                    <Loader2 className="animate-spin" /> {t.onb.activating}
                  </>
                ) : (
                  t.onb.activate
                )}
              </Button>

              <p className="text-center font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70">
                {t.onb.storedNote}
              </p>

              {/* import path — restores a wakeel.workspace/v1 export */}
              <div className="mt-1 flex flex-col items-center gap-2.5">
                <span className="font-mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground/50">
                  {t.onb.or}
                </span>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={importing || mutation.isPending}
                  className="group flex min-h-9 items-center gap-2 rounded-sm border border-dashed border-gold/30 bg-gold/[0.04] px-3.5 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-gold/80 transition-all hover:border-gold/60 hover:bg-gold/10 hover:text-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-60"
                >
                  {importing ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" />
                      {t.onb.importing}
                    </>
                  ) : (
                    <>
                      <Upload className="size-3.5 transition-transform group-hover:-translate-y-0.5" />
                      {t.onb.importCta}
                    </>
                  )}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  aria-hidden
                  tabIndex={-1}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleImportFile(file);
                  }}
                />
              </div>
            </form>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
