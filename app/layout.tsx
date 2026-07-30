import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const sans = Geist({ variable: "--font-sans", subsets: ["latin"] });
const mono = Geist_Mono({ variable: "--font-mono", subsets: ["latin"] });

export const viewport: Viewport = {
  themeColor: "#f5f6f8",
  colorScheme: "light",
};

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "https";
  const baseUrl = host ? `${protocol}://${host}` : undefined;
  const image = baseUrl ? `${baseUrl}/reelvolt-brand-card.png` : undefined;

  return {
    title: "ReelVolt",
    description: "Produção e métricas de Reels em um painel privado.",
    applicationName: "ReelVolt",
    manifest: "/manifest.webmanifest",
    icons: {
      icon: [
        { url: "/reelvolt-icon-192.png", sizes: "192x192", type: "image/png" },
        { url: "/reelvolt-icon-512.png", sizes: "512x512", type: "image/png" },
      ],
      apple: [{ url: "/reelvolt-icon-192.png", sizes: "192x192", type: "image/png" }],
    },
    appleWebApp: {
      capable: true,
      title: "ReelVolt",
      statusBarStyle: "default",
    },
    openGraph: {
      title: "ReelVolt",
      description: "Produção e métricas de Reels em um painel privado.",
      type: "website",
      url: baseUrl,
      images: image ? [{ url: image, width: 1716, height: 916, alt: "ReelVolt Studio de Reels" }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: "ReelVolt",
      description: "Produção e métricas de Reels em um painel privado.",
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
