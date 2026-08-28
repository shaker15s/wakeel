"use client";

import { useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import { Eye, EyeOff, Loader2, LockKeyhole, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MonoLabel } from "@/components/app/motion-bits";
import { loginAccount, registerAccount, ApiError } from "@/lib/api-client";
import { useWakeel, type SessionAccount } from "@/lib/store";
import { useT } from "@/lib/i18n";

type Mode = "login" | "register";

interface FieldErrors {
  name?: string;
  email?: string;
  password?: string;
}

/**
 * Full-screen authentication gate (OPS-DECK).
 * Rendered instead of the Console whenever the session check fails — the
 * marketing landing stays public; the console is the walled garden.
 */
export function AuthScreen() {
  const t = useT();
  const setSession = useWakeel((s) => s.setSession);
  const setView = useWakeel((s) => s.setView);
  const setUserId = useWakeel((s) => s.setUserId);
  const setOnboardingOpen = useWakeel((s) => s.setOnboardingOpen);

  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [pending, setPending] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  const validate = (): FieldErrors => {
    const errs: FieldErrors = {};
    if (mode === "register" && name.trim().length === 0) errs.name = t.auth.errName;
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
    if (!emailOk) errs.email = t.auth.errEmail;
    if (password.length < 8) errs.password = t.auth.errPassword;
    return errs;
  };

  const mapApiError = (e: unknown): string => {
    if (e instanceof ApiError) {
      if (e.status === 401) return t.auth.errCreds;
      if (e.status === 409) return t.auth.errExists;
      if (e.status === 429) return t.auth.errRate;
    }
    return t.auth.errGeneric;
  };

  /** After a successful auth: adopt the right operator persona (or none). */
  const adoptSession = async (account: SessionAccount) => {
    setSession(account);
    // validate the localStorage persona against this account's operators
    try {
      const res = await fetch("/api/auth/me");
      if (res.ok) {
        const data = (await res.json()) as {
          operators: { id: string }[];
        };
        const stored = useWakeel.getState().userId;
        if (data.operators.length === 0) {
          setUserId(null, { persist: false });
          setOnboardingOpen(true);
        } else if (!stored || !data.operators.some((o) => o.id === stored)) {
          setUserId(data.operators[0].id);
        }
      }
    } catch {
      // me-check failed — console requests will surface it if real
    }
    toast.success(
      mode === "register"
        ? t.auth.accountCreated(account.name)
        : t.auth.welcomeBack(account.name),
    );
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const errs = validate();
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) {
      setFormError(t.auth.summary);
      return;
    }
    setPending(true);
    try {
      const res =
        mode === "register"
          ? await registerAccount({ name: name.trim(), email: email.trim(), password })
          : await loginAccount({ email: email.trim(), password });
      await adoptSession(res.account);
    } catch (err) {
      setFormError(mapApiError(err));
    } finally {
      setPending(false);
    }
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setFieldErrors({});
    setFormError(null);
  };

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background px-4 py-16">
      {/* ---- background layers (same DNA as the landing hero) ---- */}
      <div className="absolute inset-0" aria-hidden>
        <div
          className="animate-aurora absolute -right-1/4 top-0 size-[640px] rounded-full opacity-60"
          style={{
            background:
              "radial-gradient(circle, rgba(232,180,74,0.06) 0%, transparent 60%)",
          }}
        />
        <div className="bg-blueprint absolute inset-0" />
        <div className="noise absolute inset-0" />
      </div>

      {/* ---- card ---- */}
      <motion.div
        initial={{ opacity: 0, y: 22, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className="corner-frame relative z-10 w-full max-w-md bg-card/90 shadow-[0_0_90px_-24px_rgba(232,180,74,0.35)] backdrop-blur-sm"
      >
        <div className="bg-blueprint p-6 sm:p-8">
          <div className="flex items-center justify-between gap-3">
            <MonoLabel gold className="border border-gold/25 bg-gold/5 px-2.5 py-1.5">
              [ {t.auth.eyebrow} ]
            </MonoLabel>
            <LockKeyhole aria-hidden className="size-4 text-gold/70" />
          </div>

          <h1 className="mt-5 font-display text-2xl font-bold tracking-tight text-foreground sm:text-[1.7rem]">
            {t.auth.title}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {t.auth.subtitle}
          </p>

          {/* ---- mode tabs ---- */}
          <div
            role="tablist"
            aria-label={t.auth.eyebrow}
            className="mt-6 grid grid-cols-2 gap-1 rounded-md border border-gold/15 bg-black/30 p-1"
          >
            {(["login", "register"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                onClick={() => switchMode(m)}
                className={`rounded px-3 py-2 font-mono-data text-[11px] tracking-[0.14em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold ${
                  mode === m
                    ? "bg-gold/15 text-gold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {m === "login" ? t.auth.tabLogin : t.auth.tabRegister}
              </button>
            ))}
          </div>

          {/* ---- form ---- */}
          <form onSubmit={onSubmit} noValidate className="mt-6 flex flex-col gap-4">
            {mode === "register" && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="auth-name">{t.auth.nameLabel}</Label>
                <Input
                  id="auth-name"
                  name="name"
                  autoComplete="name"
                  placeholder={t.auth.namePh}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  aria-invalid={!!fieldErrors.name}
                  aria-describedby={fieldErrors.name ? "auth-name-err" : undefined}
                  className="border-gold/20 bg-black/40 focus-visible:ring-gold/50"
                  maxLength={80}
                />
                {fieldErrors.name && (
                  <p id="auth-name-err" className="text-xs text-red-400">
                    {fieldErrors.name}
                  </p>
                )}
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="auth-email">{t.auth.emailLabel}</Label>
              <Input
                id="auth-email"
                name="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder={t.auth.emailPh}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={!!fieldErrors.email}
                aria-describedby={fieldErrors.email ? "auth-email-err" : undefined}
                className="border-gold/20 bg-black/40 focus-visible:ring-gold/50"
                maxLength={254}
                dir="ltr"
              />
              {fieldErrors.email && (
                <p id="auth-email-err" className="text-xs text-red-400">
                  {fieldErrors.email}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="auth-password">{t.auth.passwordLabel}</Label>
              <div className="relative">
                <Input
                  id="auth-password"
                  name="password"
                  type={showPw ? "text" : "password"}
                  autoComplete={
                    mode === "register" ? "new-password" : "current-password"
                  }
                  placeholder={t.auth.passwordPh}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-invalid={!!fieldErrors.password}
                  aria-describedby="auth-password-hint"
                  className="border-gold/20 bg-black/40 pr-10 focus-visible:ring-gold/50"
                  maxLength={128}
                  dir="ltr"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  aria-label={showPw ? t.auth.hidePassword : t.auth.showPassword}
                  aria-pressed={showPw}
                  className="absolute inset-y-0 end-2 my-auto flex size-7 items-center justify-center rounded text-muted-foreground transition-colors hover:text-gold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
                >
                  {showPw ? (
                    <EyeOff aria-hidden className="size-4" />
                  ) : (
                    <Eye aria-hidden className="size-4" />
                  )}
                </button>
              </div>
              <p
                id="auth-password-hint"
                className={`text-xs ${
                  fieldErrors.password ? "text-red-400" : "text-muted-foreground"
                }`}
              >
                {fieldErrors.password ?? t.auth.passwordHint}
              </p>
            </div>

            {/* form-level error (announced) */}
            <div aria-live="assertive" role="alert">
              {formError && (
                <p className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                  {formError}
                </p>
              )}
            </div>

            <Button
              type="submit"
              disabled={pending}
              className="btn-shine mt-1 h-11 w-full bg-gold font-mono-data text-[12px] font-semibold tracking-[0.16em] text-black hover:bg-gold/90"
            >
              {pending ? (
                <>
                  <Loader2 aria-hidden className="me-2 size-4 animate-spin" />
                  {t.auth.submitting}
                </>
              ) : mode === "login" ? (
                t.auth.submitLogin
              ) : (
                t.auth.submitRegister
              )}
            </Button>
          </form>

          <div className="mt-4 flex items-center justify-between text-xs">
            <button
              type="button"
              onClick={() => switchMode(mode === "login" ? "register" : "login")}
              className="text-gold underline-offset-4 transition-colors hover:text-gold/80 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
            >
              {mode === "login" ? t.auth.toRegister : t.auth.toLogin}
            </button>
            <button
              type="button"
              onClick={() => setView("landing")}
              className="text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
            >
              {t.auth.backToSite}
            </button>
          </div>

          <p className="mt-6 flex items-center gap-1.5 border-t border-gold/10 pt-4 text-[11px] text-muted-foreground">
            <ShieldCheck aria-hidden className="size-3.5 shrink-0 text-gold/60" />
            {t.auth.secureNote}
          </p>
        </div>
      </motion.div>
    </div>
  );
}
