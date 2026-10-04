import type { NextConfig } from "next";

/**
 * Baseline security headers — applied to every response.
 * (CSP is intentionally not enforced yet: Next.js inline bootstrap scripts
 * would need nonces; planned for the hardened deploy round.)
 *
 * NOTE: `X-Frame-Options: DENY` is deliberately OMITTED here, not forgotten.
 * This sandbox's live preview renders the running app inside an iframe on a
 * different origin (https://{port}-{sandboxId}.e2b.app) — `DENY` (or even
 * `SAMEORIGIN`) makes the browser silently refuse to paint anything inside
 * that iframe, which looks exactly like "a black screen with nothing in it"
 * and has no visible console error. Clickjacking protection for a real
 * production deployment (which is not expected to run inside a third-party
 * iframe) should be reinstated at that point — e.g. a CSP `frame-ancestors`
 * directive scoped to the real deployment's known embedding origins, decided
 * alongside the CSP work already flagged above, not a blanket `DENY` here.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  /**
   * TEMPORARY, sandbox-only: Next.js dev mode blocks cross-origin requests
   * to its own dev resources (HMR websocket, RSC payloads, etc.) by default.
   * This sandbox's live preview is served from a *different* origin
   * (https://{port}-{sandboxId}.e2b.app) than the dev server's own
   * localhost/0.0.0.0 bind address, so without this allowlist every page
   * silently fails to hydrate — it looks exactly like a blank/black screen,
   * with the real reason only visible in the dev server's own terminal log
   * ("Blocked cross-origin request ... from ...e2b.app"). Harmless in dev;
   * this setting has no effect on a production build (`next build && next
   * start`), so it does not need to be "removed later."
   */
  allowedDevOrigins: ["*.e2b.app"],
  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders },
    ];
  },
  /**
   * TEMPORARY, sandbox-only: this environment's Prisma client cannot be
   * generated (no network access to binaries.prisma.sh — see
   * docs/implementation/00-repo-audit.md), so the real authenticated
   * console at "/" cannot boot (every DB-backed API route 500s). Rather
   * than land visitors on a page that silently does nothing, send them
   * straight to the live runtime demo, which needs neither Prisma nor a
   * real Odoo instance. Remove this redirect once a working database is
   * available (e.g. outside this sandbox) and the real console can boot.
   */
  async redirects() {
    return [
      { source: "/", destination: "/demo/invoice", permanent: false },
    ];
  },
};

export default nextConfig;
