import "@mantine/core/styles.css";
import "./globals.css";

import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { MantineProvider, ColorSchemeScript } from "@mantine/core";
import { theme } from "@/theme";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
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
    <html lang="en" data-mantine-color-scheme="dark" className={inter.variable}>
      <head>
        <ColorSchemeScript defaultColorScheme="dark" />
      </head>
      <body>
        <MantineProvider theme={theme} defaultColorScheme="dark">
          {children}
        </MantineProvider>
      </body>
    </html>
  );
}
