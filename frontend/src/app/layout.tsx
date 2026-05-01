import type { Metadata } from "next";
import "./globals.css";
import SessionAuthProvider from "@/src/components/SessionAuthProvider";
import { ToastProvider } from "@/src/components/Toast";

export const metadata: Metadata = {
  title: "Helpdesk - Tesis",
  description: "Sistema de tickets con Oracle y Next.js",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>
        <SessionAuthProvider>
          <ToastProvider>
            {children}
          </ToastProvider>
        </SessionAuthProvider>
      </body>
    </html>
  );
}