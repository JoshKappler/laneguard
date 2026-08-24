import type { Metadata } from "next";
import { IBM_Plex_Sans, IBM_Plex_Mono, IBM_Plex_Serif } from "next/font/google";
import "./globals.css";

const sans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-sans",
  display: "swap",
});
const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
  display: "swap",
});
const serif = IBM_Plex_Serif({
  subsets: ["latin"],
  weight: ["400", "600"],
  variable: "--font-plex-serif",
  display: "swap",
});

const title = "LaneGuard: behavioral anti-cheat bench for skill-money games";
const description =
  "An honest, measured anti-cheat test bench: an original simulation of a lane-change money game, three attacker tiers (one that defeats the whole client-side detector), a 7-signal behavioral detector, and the economic argument that actually binds a bot.";

export const metadata: Metadata = {
  metadataBase: new URL("https://laneguard.joshuakappler.com"),
  title,
  description,
  openGraph: {
    title,
    description,
    type: "website",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "LaneGuard test bench" }],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} ${serif.variable}`}>
      <head>
        {/* Luckiest Guy is referenced by literal family name inside the game
            canvas (ctx.font), so it is loaded the classic way rather than via
            next/font's hashed family. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Luckiest+Guy&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
