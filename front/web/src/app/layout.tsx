import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CERA Operations Control Tower (Prototype)",
  description: "Simulated scenario playback — Warehouse capacity exception, recovery plan, replies and re-plan",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
