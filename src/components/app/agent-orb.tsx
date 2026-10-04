"use client";

import { motion } from "framer-motion";
import { usePrefersReducedMotion } from "@/components/app/motion-bits";
import { cn } from "@/lib/utils";

export type AgentOrbState = "idle" | "thinking" | "waiting" | "success" | "error";

const STATE_COLOR: Record<AgentOrbState, string> = {
  idle: "#e8b44a",
  thinking: "#e8b44a",
  waiting: "#e8b44a",
  success: "#3ecf8e",
  error: "#e5533d",
};

const STATE_LABEL: Record<AgentOrbState, string> = {
  idle: "Agent idle",
  thinking: "Agent thinking",
  waiting: "Agent waiting on you",
  success: "Agent finished successfully",
  error: "Agent hit a problem",
};

/**
 * A small living avatar for the agent itself — the whole point is that the
 * runtime's internal state (idle / actively reasoning / waiting on a human /
 * done) reads as something *alive*, not just a status badge. Purely
 * decorative (aria-hidden); the actual state is announced separately via an
 * aria-live region so screen reader users get one clear announcement
 * instead of fighting this element's constant motion.
 */
export function AgentOrb({
  state = "idle",
  size = 64,
  className,
}: {
  state?: AgentOrbState;
  size?: number;
  className?: string;
}) {
  const reduced = usePrefersReducedMotion();
  const color = STATE_COLOR[state];
  const thinking = state === "thinking" || state === "waiting";

  return (
    <div
      aria-hidden
      title={STATE_LABEL[state]}
      className={cn("relative grid shrink-0 place-items-center", className)}
      style={{ width: size, height: size }}
    >
      <motion.div
        className="absolute inset-0 rounded-full"
        style={{ background: `radial-gradient(closest-side, ${color}40, transparent 72%)` }}
        animate={
          reduced
            ? {}
            : {
                scale: thinking ? [1, 1.3, 1] : [1, 1.1, 1],
                opacity: thinking ? [0.55, 1, 0.55] : [0.35, 0.6, 0.35],
              }
        }
        transition={{ duration: thinking ? 1.3 : 3, repeat: Infinity, ease: "easeInOut" }}
      />

      {!reduced && thinking && (
        <motion.svg
          className="absolute inset-0"
          viewBox="0 0 100 100"
          animate={{ rotate: 360 }}
          transition={{ duration: 2.2, repeat: Infinity, ease: "linear" }}
        >
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            stroke={color}
            strokeWidth="2"
            strokeDasharray="22 200"
            strokeLinecap="round"
            opacity={0.85}
          />
        </motion.svg>
      )}

      {!reduced && state === "success" && (
        <motion.svg className="absolute inset-0" viewBox="0 0 100 100">
          <motion.circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            stroke={color}
            strokeWidth="2"
            strokeLinecap="round"
            initial={{ pathLength: 0, opacity: 1 }}
            animate={{ pathLength: 1, opacity: 0 }}
            transition={{ duration: 1, ease: "easeOut" }}
          />
        </motion.svg>
      )}

      <motion.div
        className="relative rounded-full"
        style={{
          width: size * 0.52,
          height: size * 0.52,
          background: `radial-gradient(circle at 34% 28%, ${color}, color-mix(in srgb, ${color} 35%, #0a0908))`,
          boxShadow: `0 0 ${Math.round(size * 0.55)}px ${color}55, inset 0 0 ${Math.round(
            size * 0.14,
          )}px rgba(0,0,0,0.45)`,
        }}
        animate={
          reduced
            ? {}
            : { scale: thinking ? [1, 1.09, 0.96, 1] : state === "error" ? [1, 0.95, 1] : [1, 1.04, 1] }
        }
        transition={{ duration: thinking ? 1 : 2.6, repeat: Infinity, ease: "easeInOut" }}
      />

      {!reduced &&
        thinking &&
        [0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="absolute rounded-full"
            style={{ width: Math.max(3, size * 0.045), height: Math.max(3, size * 0.045), background: color }}
            animate={{
              x: [0, Math.cos((i * 2 * Math.PI) / 3) * size * 0.34, 0],
              y: [0, Math.sin((i * 2 * Math.PI) / 3) * size * 0.34, 0],
              opacity: [0, 1, 0],
            }}
            transition={{ duration: 1.7, repeat: Infinity, delay: i * 0.22, ease: "easeInOut" }}
          />
        ))}
    </div>
  );
}
