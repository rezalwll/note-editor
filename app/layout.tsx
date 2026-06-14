import type { Metadata, Viewport } from "next";
import { Noto_Naskh_Arabic, Noto_Sans_Arabic } from "next/font/google";

import { PwaRuntime } from "@/components/pwa-runtime";
import "./globals.css";

const notoSansArabic = Noto_Sans_Arabic({
  variable: "--font-sans",
  subsets: ["arabic"],
});

const notoNaskhArabic = Noto_Naskh_Arabic({
  variable: "--font-serif",
  subsets: ["arabic"],
});

export const metadata: Metadata = {
  title: "notava",
  description: "notava یک دفترچه خصوصی برای یادداشت‌ها و صفحه‌های مطالعه‌ی شخصی است.",
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
      <body className={`${notoSansArabic.variable} ${notoNaskhArabic.variable}`}>
        <PwaRuntime />
        {children}
      </body>
    </html>
  );
}
