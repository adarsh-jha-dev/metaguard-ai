import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import LayoutNav from "./layout-nav";
import { ConnectionProvider } from "@/lib/connection-context";
import { themeInitScript } from "@/lib/theme";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "MetaGuard AI",
  description: "AI-powered data governance copilot",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      suppressHydrationWarning
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable}`}
    >
      <body className="antialiased">
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <ConnectionProvider>
          <LayoutNav>{children}</LayoutNav>
        </ConnectionProvider>
      </body>
    </html>
  );
}
