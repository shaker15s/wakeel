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
  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders },
    ];
  },
};

export default nextConfig;
