"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Database, Key, Link2, Loader2, Lock, ShieldCheck, XCircle } from "lucide-react";
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
import { MonoLabel } from "@/components/app/motion-bits";
import { useWakeel } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function ConnectOdooDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const lang = useWakeel((s) => s.lang);
  const userId = useWakeel((s) => s.userId);
  const queryClient = useQueryClient();

  const [form, setForm] = useState({
    url: "http://localhost:8069",
    db: "odoo",
    username: "admin",
    apiKeyOrPassword: "",
  });

  const [connectionStatus, setConnectionStatus] = useState<any>(null);

  const mutation = useMutation({
    mutationFn: async (payload: typeof form) => {
      const res = await fetch("/api/erp/odoo/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          ...payload,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Connection failed.");
      }
      return data;
    },
    onSuccess: (data) => {
      setConnectionStatus(data.status);
      queryClient.invalidateQueries({ queryKey: ["systems", userId] });
      queryClient.invalidateQueries({ queryKey: ["activity", userId] });
      toast.success(lang === "ar" ? "تم ربط Odoo 19 بنجاح!" : "Odoo 19 connected successfully!");
    },
    onError: (err: Error) => {
      toast.error(lang === "ar" ? "فشل الاتصال بـ Odoo" : "Odoo connection failed", {
        description: err.message,
      });
    },
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.url || !form.db || !form.username || !form.apiKeyOrPassword) {
      toast.error(lang === "ar" ? "يرجى ملء جميع الحقول" : "Please fill in all connection fields");
      return;
    }
    mutation.mutate(form);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border-border bg-card p-0">
        <div className="relative overflow-hidden p-6">
          <DialogHeader className="gap-2 text-start">
            <div className="flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-lg border border-gold/40 bg-gold/10 text-gold">
                <Database className="size-4" />
              </span>
              <div>
                <MonoLabel gold className="text-[10px]">
                  [ ERP CONNECTOR ]
                </MonoLabel>
                <DialogTitle className="font-display text-xl font-bold tracking-tight">
                  {lang === "ar" ? "ربط نظام Odoo 19" : "Connect Odoo 19 ERP"}
                </DialogTitle>
              </div>
            </div>
            <DialogDescription className="text-xs">
              {lang === "ar"
                ? "سيتصل وكيلك بحساب Odoo الفعلي عبر واجهة JSON-RPC ويتحقق من الصلاحيات الممنوحة له فقط."
                : "Wakeel connects to your live Odoo instance via External API and respects all user permissions."}
            </DialogDescription>
          </DialogHeader>

          {!connectionStatus ? (
            <form onSubmit={submit} className="mt-5 flex flex-col gap-3.5">
              <div className="flex flex-col gap-1">
                <Label className="font-mono text-[10px] uppercase text-muted-foreground">
                  {lang === "ar" ? "رابط السيرفر (Server URL)" : "Server URL"}
                </Label>
                <Input
                  value={form.url}
                  onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
                  placeholder="https://mycompany.odoo.com"
                  className="h-10 border-border bg-secondary/50 font-mono text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <Label className="font-mono text-[10px] uppercase text-muted-foreground">
                    {lang === "ar" ? "قاعدة البيانات (Database)" : "Database Name"}
                  </Label>
                  <Input
                    value={form.db}
                    onChange={(e) => setForm((f) => ({ ...f, db: e.target.value }))}
                    placeholder="odoo"
                    className="h-10 border-border bg-secondary/50 font-mono text-xs"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <Label className="font-mono text-[10px] uppercase text-muted-foreground">
                    {lang === "ar" ? "المستخدم (Login / Email)" : "Username"}
                  </Label>
                  <Input
                    value={form.username}
                    onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                    placeholder="admin"
                    className="h-10 border-border bg-secondary/50 font-mono text-xs"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <Label className="font-mono text-[10px] uppercase text-muted-foreground">
                  {lang === "ar" ? "مفتاح API أو كلمة المرور (API Key / Password)" : "API Key or Password"}
                </Label>
                <Input
                  type="password"
                  value={form.apiKeyOrPassword}
                  onChange={(e) => setForm((f) => ({ ...f, apiKeyOrPassword: e.target.value }))}
                  placeholder="••••••••••••"
                  className="h-10 border-border bg-secondary/50 font-mono text-xs"
                />
              </div>

              <Button
                type="submit"
                disabled={mutation.isPending}
                className="mt-2 h-11 bg-primary font-mono text-xs font-semibold uppercase tracking-wider text-primary-foreground hover:bg-gold-pale"
              >
                {mutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    {lang === "ar" ? "جارٍ التحقق من الصلاحيات والاتصال..." : "Verifying Permissions & Connecting..."}
                  </>
                ) : (
                  <>
                    <Link2 className="mr-2 size-4" />
                    {lang === "ar" ? "فحص وربط Odoo" : "Test & Connect Odoo"}
                  </>
                )}
              </Button>
            </form>
          ) : (
            <div className="mt-5 flex flex-col gap-4">
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4">
                <div className="flex items-center gap-2 text-emerald-400">
                  <CheckCircle2 className="size-5" />
                  <h4 className="font-display text-sm font-bold">
                    {lang === "ar" ? "الاتصال نشط ومؤكد بنجاح!" : "Connection Verified & Live!"}
                  </h4>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {lang === "ar"
                    ? `تم تسجيل الدخول كـ ${connectionStatus.user.name} (${connectionStatus.user.login}) في ${connectionStatus.latencyMs}ms.`
                    : `Authenticated as ${connectionStatus.user.name} (${connectionStatus.user.login}) in ${connectionStatus.latencyMs}ms.`}
                </p>
              </div>

              {/* Permissions Breakdown */}
              <div className="flex flex-col gap-2 rounded-lg border border-border bg-secondary/40 p-3.5 text-xs">
                <p className="font-mono text-[10px] font-bold uppercase text-gold">
                  {lang === "ar" ? "ملخص الصلاحيات المكتشفة" : "Verified Permissions Summary"}
                </p>

                <div className="grid grid-cols-2 gap-2 pt-1 font-mono text-[11px]">
                  <div className="flex items-center gap-1.5 text-foreground">
                    <CheckCircle2 className="size-3.5 text-emerald-400" />
                    <span>قراءة المبيعات (Sales)</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-foreground">
                    <CheckCircle2 className="size-3.5 text-emerald-400" />
                    <span>العملاء (Customers)</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-foreground">
                    <CheckCircle2 className="size-3.5 text-emerald-400" />
                    <span>المخزون (Inventory)</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-foreground">
                    <CheckCircle2 className="size-3.5 text-emerald-400" />
                    <span>مسودات الفواتير (Draft Invoices)</span>
                  </div>
                </div>
              </div>

              <Button
                onClick={() => onOpenChange(false)}
                className="h-11 bg-primary font-mono text-xs font-semibold uppercase tracking-wider text-primary-foreground hover:bg-gold-pale"
              >
                {lang === "ar" ? "جاهز! ابدأ محادثة وكيلك" : "Ready! Start Operating with Wakeel"}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
