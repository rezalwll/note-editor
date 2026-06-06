import type { Metadata } from "next";
import { Manrope, Newsreader } from "next/font/google";

import "./globals.css";

const manrope = Manrope({
  variable: "--font-sans",
  subsets: ["latin"],
});

const newsreader = Newsreader({
  variable: "--font-serif",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Personal Notebook",
  description: "Private notebook for personal notes and study pages.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${manrope.variable} ${newsreader.variable}`}>
        {children}
      </body>
    </html>
  );
}
