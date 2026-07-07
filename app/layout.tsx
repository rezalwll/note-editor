import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";

import { PwaRuntime } from "@/components/pwa-runtime";
import "./globals.css";

const iranYekanSans = localFont({
  variable: "--font-sans",
  src: [
    {
      path: "./fonts/iranyekan.woff2",
      weight: "400",
      style: "normal",
    },
  ],
  display: "swap",
});

const iranYekanSerif = localFont({
  variable: "--font-serif",
  src: [
    {
      path: "./fonts/iranyekan.woff2",
      weight: "400",
      style: "normal",
    },
  ],
  display: "swap",
});

export const metadata: Metadata = {
  title: "notava",
  description: "فضای خصوصی notava برای یادداشت‌ها، مجموعه‌ها، زیر مجموعه‌ها و صفحه‌های شخصی است.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "notava",
  },
  icons: {
    shortcut: [{ url: "/favicon.ico" }],
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/brand/notava-icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/brand/notava-icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#b5baff",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fa" dir="rtl">
      <body
        suppressHydrationWarning
        className={`${iranYekanSans.variable} ${iranYekanSerif.variable}`}
      >
        <PwaRuntime />
        {children}
      </body>
    </html>
  );
}
