import { defineConfig } from "@pandacss/dev";

/*
  OPEN QUESTIONS
  - is preflight false correct here?
    - should we scope it like in petrinaut?
  - should we scope the CSS classes generally?
    - does that even affect our consumers? (they might only get the typed runtime stuff from here)
*/
export default defineConfig({
  include: ["./stories/**/*.{ts,tsx}", "../ds-components/src/**/*.{ts,tsx}"],
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
          // NOTE: Pre-generate colorPalette CSS for all palettes so dynamic switching works
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
        },
      },
    ],
  },
});
