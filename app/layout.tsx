import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const sans = Geist({ variable: "--font-sans", subsets: ["latin"] });
const mono = Geist_Mono({ variable: "--font-mono", subsets: ["latin"] });

export const viewport: Viewport = {
  themeColor: "#d8ff5d",
  colorScheme: "dark",
};

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "https";
  const baseUrl = host ? `${protocol}://${host}` : undefined;
  const image = baseUrl ? `${baseUrl}/og-v2.png` : undefined;

  return {
    title: "BT Supply Reel Inbox",
    description: "Compartilhe Reels autorizados, baixe o MP4 e acompanhe tudo no Notion.",
    applicationName: "BT Supply Reel Inbox",
    manifest: "/manifest.webmanifest",
    appleWebApp: {
      capable: true,
      title: "Reel Inbox",
      statusBarStyle: "black-translucent",
    },
    openGraph: {
      title: "Compartilhe. Baixe. Organize.",
      description: "A caixa de entrada privada de Reels da BT Supply.",
      type: "website",
      url: baseUrl,
      images: image ? [{ url: image, width: 1731, height: 909, alt: "BT Supply Reel Inbox" }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: "BT Supply Reel Inbox",
      description: "Reels autorizados organizados em um só fluxo.",
      images: image ? [image] : undefined,
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body className={`${sans.variable} ${mono.variable}`}>{children}</body>
    </html>
  );
}
