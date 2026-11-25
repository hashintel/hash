import { createRequire } from "node:module";

import { defineConfig, type Preset } from "@pandacss/dev";

import {
  resolvePandaBuildInfoPath,
  scopedThemeConfig,
} from "@hashintel/ds-components/preset";
import { petrinautPandaPreset } from "@hashintel/petrinaut/panda-preset";

/** Panda evaluates this config through CJS, so `__filename` is available here. */
const require = createRequire(__filename);

const scopedConfig = scopedThemeConfig(".petrinaut-root");

/**
 * The Petrinaut preset is deliberately untyped (see its doc comment); checked
 * against Panda's `Preset` here, as in Petrinaut's own config. Listed last,
 * as it is there, so that this app's stylesheet and the library's
 * `styles.css` are generated from one theme.
 */
const checkedPetrinautPandaPreset: Preset = petrinautPandaPreset as Preset;

/**
 * Extracts utility classes from the website's own source and from Brunch's
 * client (`@hashintel/brunch-agent/ui`, through the build info it ships). The
 * petrinaut library ships a prebuilt `@hashintel/petrinaut/styles.css`
 * covering its components; this config emits a supplementary stylesheet for
 * any `css()` calls in this app and in Brunch's. Layer order matches the
 * library so utilities cascade together.
 */
export default defineConfig({
  ...scopedConfig,
  presets: [...scopedConfig.presets, checkedPetrinautPandaPreset],
  include: [
    "./src/**/*.{ts,tsx,js,jsx}",
    resolvePandaBuildInfoPath(
      "@hashintel/brunch-agent/panda.buildinfo.json",
      require.resolve,
    ),
  ],
  exclude: [],
  polyfill: true,
  importMap: "@hashintel/ds-helpers",
});
