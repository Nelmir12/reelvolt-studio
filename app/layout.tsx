import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const sans = Geist({ variable: "--font-sans", subsets: ["latin"] });
const mono = Geist_Mono({ variable: "--font-mono", subsets: ["latin"] });

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "https";
  const image = host ? `${protocol}://${host}/og.png` : undefined;
  return {
    title: "Reel Inbox — Reels salvos automaticamente",
    description: "Receba Reels pelo Direct do Instagram e salve os vídeos automaticamente.",
    openGraph: {
      title: "Mandou no Direct. Salvou sozinho.",
      description: "Reels recebidos por DM, baixados e guardados automaticamente.",
      type: "website",
      images: image ? [{ url: image, width: 1200, height: 630, alt: "Reel Inbox" }] : undefined,
    },
    twitter: { card: "summary_large_image", images: image ? [image] : undefined },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body className={`${sans.variable} ${mono.variable}`}>{children}</body></html>;
}
