import { defineConfig } from "vitest/config";
import path from "path";

/**
 * Minimal, dependency-light test runner config (vitest).
 *
 * WAKIL's phase-0 baseline had zero executable tests (see
 * docs/implementation/00-repo-audit.md §4.4) despite one file that looked
 * like a test suite. This config exists so `npm test` actually runs
 * something, against the same `@/*` path alias used by the app.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    reporters: "default",
    css: false,
  },
  css: {
    postcss: { plugins: [] },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
