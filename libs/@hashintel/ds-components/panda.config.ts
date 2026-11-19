import { type Config, defineConfig } from "@pandacss/dev";

import { preset } from "./src/preset";

export const coreConfig: Config = {
  importMap: "@hashintel/ds-helpers",
  outdir: "../ds-helpers/styled-system",
  include: [
    "./src/components/**/*.{ts,tsx}",
    "./src/primitives/**/*.{ts,tsx}",
    "./src/util/**/*.{ts,tsx}",
  ],
  // `panda ship` publishes what this config extracts into every consumer's
  // stylesheet; story styles are added back by the docs and local configs.
  exclude: ["**/*.{stories,story}.tsx", "**/*.test.{ts,tsx}"],
  jsxFramework: "react",
  // Under the default "all", Panda reads any prop named like a CSS property,
  // on any capitalised JSX tag, as a style: `<Tooltip position="right">`
  // shipped `position: right`. Codegen follows this too, so the generated JSX
  // components take styles through `css` and their pattern props only.
  jsxStyleProps: "minimal",
  outExtension: "mjs",
  preflight: false,
  presets: [preset],
  strictPropertyValues: true,
  strictTokens: true,
  validation: "error",
};

export default defineConfig(coreConfig);
