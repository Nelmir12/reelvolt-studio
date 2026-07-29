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
  const image = baseUrl ? `${baseUrl}/og-v3.png` : undefined;

  return {
    title: "BT Supply Reel Inbox",
    description: "Baixe Reels autorizados, aprove e publique na BT Supply em um único painel.",
    applicationName: "BT Supply Reel Inbox",
    manifest: "/manifest.webmanifest",
    appleWebApp: {
      capable: true,
      title: "Reel Inbox",
      statusBarStyle: "black-translucent",
    },
    openGraph: {
      title: "Baixe. Aprove. Publique.",
      description: "O estúdio privado de Reels da BT Supply.",
      type: "website",
      url: baseUrl,
      images: image ? [{ url: image, width: 1600, height: 900, alt: "BT Supply ReelVolt Studio" }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: "BT Supply Reel Inbox",
      description: "Download, aprovação e publicação de Reels em um só fluxo.",
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
