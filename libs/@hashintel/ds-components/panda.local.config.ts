import { defineConfig } from "@pandacss/dev";

import { coreConfig } from "./panda.config";

export default defineConfig({
  ...coreConfig,
  // `outdir` is inherited from `coreConfig` on purpose: both configs must write
  // to the same package-private directory, so that whichever one ran last is
  // what `@hashintel/ds-helpers` copies.
  include: [
    ...(coreConfig.include ?? []),
    "./src/preset/**/*.{ts,tsx}",
    "./.ladle/**/*.{ts,tsx}",
  ],
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
