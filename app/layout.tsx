import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: "CEDAFAM — Sistema de Gestión",
  description: "Gestión de consultas psicológicas y psiquiátricas — CEDAFAM",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className="min-h-screen bg-background antialiased">
        <Providers>{children}</Providers>
        <Analytics />
      </body>
    </html>
  );
}
