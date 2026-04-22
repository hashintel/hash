import { defineConfig } from "@pandacss/dev";

import { preset } from "./src/preset";

export default defineConfig({
  importMap: "@hashintel/ds-helpers",
  outdir: "../ds-helpers/styled-system",
  include: [
    "./src/components/**/*.{ts,tsx}",
    "./src/playground/**/*.{ts,tsx}",
    "./src/stories/**/*.{ts,tsx}",
    "./.ladle/**/*.{ts,tsx}",
  ],
  jsxFramework: "react",
  outExtension: "mjs",
  preflight: false,
  presets: [preset],
  strictPropertyValues: true,
  strictTokens: true,
  validation: "error",
  staticCss: {
    css: [
      {
        properties: {
          colorPalette: [
            "neutral",
            "purple",
            "red",
            "pink",
            "orange",
            "yellow",
            "green",
            "blue",
            "status.info",
            "status.success",
            "status.warning",
            "status.error",
          ],
          textStyle: ["xs", "sm", "base", "lg", "xl", "2xl", "3xl", "4xl"],
          leading: ["tight", "normal", "loose"],
          roundness: ["none", "sm", "md", "lg", "xl"],
          density: ["compact", "normal", "comfortable"],
          focusVisibleRing: ["outside", "inside", "mixed"],
        },
      },
    ],
  },
});
