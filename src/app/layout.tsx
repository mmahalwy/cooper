import "@mantine/core/styles.css";
import "./globals.css";

import type { Metadata } from "next";
import { Inter, Playfair_Display, Geist } from "next/font/google";
import { MantineProvider, ColorSchemeScript } from "@mantine/core";
import { theme } from "@/theme";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
});

export const metadata: Metadata = {
  title: "Cooper — The AI Teammate That Actually Does the Work",
  description:
    "Cooper is an AI teammate that truly works like an embedded person on your team. Not a chatbot. Not an assistant. A real teammate that connects to your tools and delivers results.",
  openGraph: {
    title: "Cooper — The AI Teammate That Actually Does the Work",
    description:
      "An AI teammate that truly works like an embedded person on your team.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-mantine-color-scheme="light" className={cn(inter.variable, playfair.variable, "font-sans", geist.variable)}>
      <head>
        <ColorSchemeScript forceColorScheme="light" />
      </head>
      <body>
        <MantineProvider theme={theme} forceColorScheme="light">
          {children}
        </MantineProvider>
      </body>
    </html>
  );
}
