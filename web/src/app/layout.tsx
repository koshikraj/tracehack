import type { Metadata } from "next";
import { IBM_Plex_Sans, IBM_Plex_Sans_Condensed, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

// Plex Sans for reading, Plex Sans Condensed for headings and map labels (transit-signage feel),
// Plex Mono only where characters must line up: addresses and hashes.
const plex = IBM_Plex_Sans({ variable: "--font-plex", subsets: ["latin"], weight: ["400", "500", "600"] });
const plexCond = IBM_Plex_Sans_Condensed({ variable: "--font-plex-cond", subsets: ["latin"], weight: ["500", "600", "700"] });
const plexMono = IBM_Plex_Mono({ variable: "--font-plex-mono", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  title: "Trace the Hack: unofficial fund-flow tracker",
  description: "Unofficial, independent tracker of the funds stolen in the October 2026 Binance hot-wallet hack. Not affiliated with Binance. Every figure is sourced.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${plex.variable} ${plexCond.variable} ${plexMono.variable} h-full`} suppressHydrationWarning>
      <body className="h-full">{children}</body>
    </html>
  );
}
