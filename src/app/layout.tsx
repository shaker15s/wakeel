import type { Metadata, Viewport } from "next";
import {
  Space_Grotesk,
  IBM_Plex_Mono,
  IBM_Plex_Sans_Arabic,
} from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const display = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const monoData = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono-data",
  display: "swap",
});

const arabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic"],
  weight: ["400", "600"],
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
