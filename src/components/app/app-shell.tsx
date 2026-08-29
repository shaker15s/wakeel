"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, MotionConfig } from "framer-motion";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DirectionProvider } from "@radix-ui/react-direction";
import { AppShellSkeleton } from "@/components/app/app-shell-skeleton";
import { Landing } from "@/components/app/landing/landing";
import { Console } from "@/components/app/console/console";
import { OnboardingDialog } from "@/components/app/onboarding-dialog";
import { AuthScreen } from "@/components/app/auth-screen";
import { SharedSystemView } from "@/components/app/shared-system-view";
import { getMe, setUnauthorizedHandler } from "@/lib/api-client";
import { useWakeel } from "@/lib/store";

/**
 * Client root: owns the React Query provider and the top-level
 * view state machine `landing ⇄ console` (onboarding is a dialog).
 */
export function AppShell() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 15_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      })
  );

  const view = useWakeel((s) => s.view);
  const hydrated = useWakeel((s) => s.hydrated);
  const lang = useWakeel((s) => s.lang);
  const shareToken = useWakeel((s) => s.shareToken);
  const session = useWakeel((s) => s.session);
  const sessionChecked = useWakeel((s) => s.sessionChecked);
  const hydrate = useWakeel((s) => s.hydrate);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // global "session died" hook — any API 401 flips the UI to the auth gate
  useEffect(() => {
    setUnauthorizedHandler(() => {
      useWakeel.setState({ session: null, sessionChecked: true });
    });
  }, []);

  // server-verified session bootstrap: /api/auth/me decides everything
  useEffect(() => {
    let cancelled = false;
    getMe()
      .then(({ account, operators }) => {
        if (cancelled) return;
        useWakeel.setState({ session: account, sessionChecked: true });
        // validate the stored persona against THIS account's workspaces
        const state = useWakeel.getState();
        if (state.view === "console") {
          if (operators.length === 0) {
            state.setUserId(null, { persist: false });
            state.setOnboardingOpen(true);
          } else if (!state.userId || !operators.some((o) => o.id === state.userId)) {
            state.setUserId(operators[0].id);
          }
        }
      })
      .catch(() => {
        if (cancelled) return;
        useWakeel.setState({ session: null, sessionChecked: true });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // react to hash changes while running (e.g. paste a share link in-session)
  useEffect(() => {
    const onHash = () => {
      const m = /^#share=([A-Za-z0-9_-]+)$/.exec(window.location.hash);
      if (m) {
        useWakeel.setState({ shareToken: m[1], view: "share" });
      }
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // mirror the language onto <html> so the whole document flips (RTL/LTR)
  useEffect(() => {
    const dir = lang === "ar" ? "rtl" : "ltr";
    document.documentElement.dir = dir;
    document.documentElement.lang = lang;
  }, [lang]);

  return (
    <QueryClientProvider client={queryClient}>
      <DirectionProvider dir={lang === "ar" ? "rtl" : "ltr"}>
      {/* framer animations collapse gracefully when the OS asks for calm */}
      <MotionConfig reducedMotion="user">
      <AnimatePresence mode="wait">
        {!hydrated ? (
          <motion.div
            key="boot"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            <AppShellSkeleton />
          </motion.div>
        ) : view === "share" && shareToken ? (
          <motion.div
            key="share"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
          >
            <SharedSystemView token={shareToken} />
          </motion.div>
        ) : view === "console" ? (
          <motion.div
            key="console"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
          >
            <Console />
          </motion.div>
        ) : (
          <motion.div
            key="landing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
          >
            <Landing />
          </motion.div>
        )}
      </AnimatePresence>
      <OnboardingDialog />
      </MotionConfig>
      </DirectionProvider>
    </QueryClientProvider>
  );
}
