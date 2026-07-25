import type { Metadata } from "next";
import "./globals.css";
import StarField from "@/components/StarField";

export const metadata: Metadata = {
  title: "CH4 — Channel4",
  description: "Channel4 Ops Network — ranked clip submission community",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@400;500;600;700&family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <StarField />
        {children}
      </body>
    </html>
  );
}
