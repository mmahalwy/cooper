import { createTheme, MantineColorsTuple } from "@mantine/core";

const brand: MantineColorsTuple = [
  "#f0f0ff",
  "#dddeff",
  "#b8b9ff",
  "#9092ff",
  "#7c7fff",
  "#6e6eff",
  "#6564ff",
  "#5453e4",
  "#4a49cc",
  "#3d3db5",
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
      "var(--font-inter), -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    fontWeight: "600",
  },
  defaultRadius: "md",
  black: "#09090b",
});
