import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Writing Review",
  description: "AI authenticity checks and personal writing-style analysis."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-ink-950 font-sans antialiased">{children}</body>
    </html>
  );
}
