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

export const metadata: Metadata = {
  title: "Wakeel — The AI Employee You Actually Hire | وكيل",
  description:
    "Wakeel discovers the systems your company already runs, then forges new ones on demand. A dark mission-control for the AI employee you actually hire.",
  keywords: [
    "Wakeel",
    "وكيل",
    "AI employee",
    "system discovery",
    "operations",
    "mission control",
  ],
  authors: [{ name: "Wakeel Systems" }],
  icons: {
    icon: "/wakeel.svg",
  },
  openGraph: {
    title: "Wakeel — The AI Employee You Actually Hire",
    description:
      "Point Wakeel at your company. It maps your existing systems and forges the ones you are missing.",
    siteName: "Wakeel",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#0A0908",
  width: "device-width",
  initialScale: 1,
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
