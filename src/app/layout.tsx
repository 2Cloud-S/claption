import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Claption",
  description: "Four-tone video captioning for AMD Developer Hackathon ACT II"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
