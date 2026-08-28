"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppShellSkeleton } from "@/components/app/app-shell-skeleton";
import { Landing } from "@/components/app/landing/landing";
import { Console } from "@/components/app/console/console";
import { OnboardingDialog } from "@/components/app/onboarding-dialog";
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
  const hydrate = useWakeel((s) => s.hydrate);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  return (
    <QueryClientProvider client={queryClient}>
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
    </QueryClientProvider>
  );
}
