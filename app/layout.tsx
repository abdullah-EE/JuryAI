import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "JuryAI — AI decisions on trial",
  description: "Structured, independent review for high-impact AI decisions.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

