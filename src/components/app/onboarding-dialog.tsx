"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
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
import { useWakeel } from "@/lib/store";

const ROLES = ["Founder", "Operations", "Engineer", "Manager", "Other"] as const;

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
  const open = useWakeel((s) => s.onboardingOpen);
  const setOpen = useWakeel((s) => s.setOnboardingOpen);
  const setUserId = useWakeel((s) => s.setUserId);
  const setView = useWakeel((s) => s.setView);

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
      toast.success("Operator activated", {
        description: `Welcome aboard, ${data.user.name.split(" ")[0]} — your console is live.`,
      });
    },
    onError: (err: Error) => {
      toast.error("Activation failed", { description: err.message });
    },
  });

  const validate = (): boolean => {
    const next: FormErrors = {};
    if (!form.name.trim()) next.name = "Full name is required.";
    else if (form.name.trim().length < 2) next.name = "That name is too short.";
    if (!form.workspace.trim())
      next.workspace = "Workspace name is required.";
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
            <DialogHeader className="gap-3 text-left">
              <MonoLabel gold className="animate-blink">
                ● NEW OPERATOR REGISTRATION
              </MonoLabel>
              <DialogTitle className="font-display text-2xl font-bold tracking-tight">
                Activate your Wakeel
              </DialogTitle>
              <DialogDescription>
                Register an operator profile. Everything — systems, records,
                activity — is scoped to you.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={submit} className="mt-6 flex flex-col gap-4" noValidate>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="op-name" className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  Full name *
                </Label>
                <Input
                  id="op-name"
                  placeholder="e.g. Layla Hassan"
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
                  Workspace name *
                </Label>
                <Input
                  id="op-workspace"
                  placeholder="e.g. Nova Retail"
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
                  Role
                </Label>
                <Select
                  value={form.role}
                  onValueChange={(v) => setForm((f) => ({ ...f, role: v }))}
                >
                  <SelectTrigger className="h-10 w-full border-border bg-secondary/60 data-[placeholder]:text-muted-foreground">
                    <SelectValue placeholder="Select role (optional)" />
                  </SelectTrigger>
                  <SelectContent className="border-border bg-popover">
                    {ROLES.map((role) => (
                      <SelectItem key={role} value={role}>
                        {role}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button
                type="submit"
                disabled={mutation.isPending}
                className="mt-2 h-11 w-full bg-primary font-mono text-[12px] font-medium uppercase tracking-[0.14em] text-primary-foreground hover:bg-gold-pale"
              >
                {mutation.isPending ? (
                  <>
                    <Loader2 className="animate-spin" /> ACTIVATING…
                  </>
                ) : (
                  "ACTIVATE WAKEEL"
                )}
              </Button>

              <p className="text-center font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70">
                Stored locally · wakeel:user · no email required
              </p>
            </form>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
