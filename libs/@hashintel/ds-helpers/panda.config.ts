import { defineConfig } from "@pandacss/dev";

export default defineConfig({
  include: [
    /* TODO: separate this config from the one used for Ladle
      - Ladle demo requires staticCSS and should have preflight:true
      - exportable code should only include ds-components as a source, and should have preflight:false
    */
    "./stories/**/*.{ts,tsx}",
    "../ds-components/src/**/*.{ts,tsx}",
  ],
  jsxFramework: "react",
  outExtension: "mjs",
  preflight: false,
  presets: ["@hashintel/ds-theme"],
  strictPropertyValues: true,
  strictTokens: true,
  validation: "error",
  staticCss: {
    css: [
      {
        properties: {
          /*
            NOTE:
            this is specific to the Ladle demo,
            so that we can have dynamic permutations

            TODO:
            extract these dynamically
            from the exported tokens,
            instead of hard-coding them here
          */
          colorPalette: [
            // core
            "neutral",
            "purple",
            "red",
            "pink",
            "orange",
            "yellow",
            "green",
            "blue",
            // status
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
