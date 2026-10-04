import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Toaster } from "sonner";
import "./globals.css";

/**
 * Self-hosted fonts via @fontsource (actual .woff2 files vendored into
 * node_modules by npm), NOT next/font/google. This sandbox has no route to
 * fonts.googleapis.com / fonts.gstatic.com (only a small domain allowlist,
 * which does include the npm registry) — next/font/google would silently
 * fail to download at build time and Next would fall back to a generic
 * system sans-serif for the whole app, which is most of why the UI reads as
 * "cheap"/ungrounded no matter what else is styled well. next/font/local
 * needs no network at request time at all, so this works identically in
 * this sandbox and in a normal deployment with full internet access.
 */
const display = localFont({
  src: [
    { path: "../../node_modules/@fontsource/space-grotesk/files/space-grotesk-latin-300-normal.woff2", weight: "300", style: "normal" },
    { path: "../../node_modules/@fontsource/space-grotesk/files/space-grotesk-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../../node_modules/@fontsource/space-grotesk/files/space-grotesk-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "../../node_modules/@fontsource/space-grotesk/files/space-grotesk-latin-600-normal.woff2", weight: "600", style: "normal" },
    { path: "../../node_modules/@fontsource/space-grotesk/files/space-grotesk-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-display",
  display: "swap",
});

const monoData = localFont({
  src: [
    { path: "../../node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../../node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff2", weight: "500", style: "normal" },
  ],
  variable: "--font-mono-data",
  display: "swap",
});

const arabic = localFont({
  src: [
    { path: "../../node_modules/@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../../node_modules/@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-600-normal.woff2", weight: "600", style: "normal" },
    { path: "../../node_modules/@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-700-normal.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-arabic",
  display: "swap",
});


/** Canonical site origin — set NEXT_PUBLIC_SITE_URL in production. */
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Wakeel — The AI Employee You Actually Hire | وكيل",
    template: "%s | Wakeel — وكيل",
  },
  description:
    "Wakeel discovers the systems your company already runs, then forges new ones on demand. A dark mission-control for the AI employee you actually hire.",
  keywords: [
    "Wakeel",
    "وكيل",
    "AI employee",
    "AI agent platform",
    "system discovery",
    "workflow automation",
    "operations console",
    "mission control",
    "موظف ذكي",
    "أتمتة",
  ],
  authors: [{ name: "Wakeel Systems" }],
  creator: "Wakeel Systems",
  applicationName: "Wakeel",
  icons: {
    icon: "/wakeel.svg",
    apple: "/wakeel.svg",
  },
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Wakeel — The AI Employee You Actually Hire | وكيل",
    description:
      "Point Wakeel at your company. It maps your existing systems and forges the ones you are missing — a dark mission-control for your AI employee.",
    siteName: "Wakeel",
    type: "website",
    url: SITE_URL,
    locale: "en_US",
    alternateLocale: ["ar_EG"],
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "Wakeel — AI employee mission control",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Wakeel — The AI Employee You Actually Hire | وكيل",
    description:
      "Wakeel discovers the systems your company already runs, then forges the ones you are missing.",
    images: ["/og.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  category: "technology",
};

export const viewport: Viewport = {
  themeColor: "#0A0908",
  width: "device-width",
  initialScale: 1,
};

/** Structured data: helps search engines understand the product. */
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "Wakeel",
  alternateName: "وكيل",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  url: SITE_URL,
  description:
    "Wakeel discovers the systems your company already runs, then forges new ones on demand — an AI employee with a dark mission-control console.",
  inLanguage: ["en", "ar"],
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
    availability: "https://schema.org/PreOrder",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className={`${display.variable} ${monoData.variable} ${arabic.variable} antialiased bg-background text-foreground`}
      >
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        {children}
        <Toaster
          theme="dark"
          position="bottom-right"
          toastOptions={{
            style: {
              background: "#12100D",
              border: "1px solid rgba(232,180,74,0.25)",
              color: "#F5EFE4",
              fontFamily: "var(--font-mono-data), monospace",
              fontSize: "12px",
              letterSpacing: "0.02em",
              borderRadius: "6px",
            },
          }}
        />
      </body>
    </html>
  );
}
