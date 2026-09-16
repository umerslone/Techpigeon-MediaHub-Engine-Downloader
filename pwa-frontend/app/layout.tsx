import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MediaHub — Engine Downloader",
  description: "Extract video and audio in the quality and format you choose.",
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
