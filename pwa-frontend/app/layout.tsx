import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TechPigeon MediaHub - HD/4K Video Downloader",
  description: "Enterprise-grade video and audio downloader. Fast, secure, and reliable video processing platform.",
  metadataBase: new URL("http://localhost:3000"),
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
