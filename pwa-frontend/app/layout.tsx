import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MediaHub - Video Downloader",
  description: "Professional video downloading and processing platform",
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
