import type { Metadata, Viewport } from "next";

import { ThemeProvider } from "@/lib/theme";
import { WalletProvider } from "@/lib/wallet";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "ProofLayer",
    template: "%s | ProofLayer",
  },
  description:
    "Verification infrastructure for tokenized real-world assets on X Layer.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#051F20",
};

/** Applies the stored/system theme before first paint to avoid a flash. */
const themeInitScript = `(function(){try{var s=localStorage.getItem("prooflayer-theme");var dark=s==="dark"||((!s||s==="system")&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",dark);var m=document.querySelector('meta[name="theme-color"]');if(m){m.setAttribute("content",dark?"#051F20":"#f0f2f1");}}catch(e){}})();`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <ThemeProvider>
          <WalletProvider>{children}</WalletProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
