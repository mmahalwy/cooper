import { createTheme, MantineColorsTuple } from "@mantine/core";

const brand: MantineColorsTuple = [
  "#f0f4f8",
  "#dce6f0",
  "#b4cde0",
  "#89b0cd",
  "#6497bb",
  "#4a84ad",
  "#1e3a5f",
  "#1a3354",
  "#162c49",
  "#12243e",
];

export const theme = createTheme({
  primaryColor: "brand",
  colors: {
    brand,
  },
  fontFamily:
    "var(--font-inter), -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  headings: {
    fontFamily:
      "var(--font-playfair), Georgia, 'Times New Roman', serif",
    fontWeight: "600",
  },
  defaultRadius: "md",
  black: "#1a1a1a",
});
