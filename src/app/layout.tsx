import "@/app/globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ClassScout Cards",
  description: "Card generation feed for ClassScout activity discovery",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
