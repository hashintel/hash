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
});
