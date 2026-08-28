import { defineConfig, type Preset } from "@pandacss/dev";

import { scopedThemeConfig } from "@hashintel/ds-components/preset";
import { petrinautPandaPreset } from "@hashintel/petrinaut/panda-preset";

const scopedConfig = scopedThemeConfig(".petrinaut-root");

/**
 * The Petrinaut preset is deliberately untyped (see its doc comment); checked
 * against Panda's `Preset` here, as in Petrinaut's own config. Listed last so
 * its token overrides (`fonts.mono` = JetBrains) win the deep-merge: this
 * app's tokens layer writes `--fonts-mono` onto the same `.petrinaut-root`
 * scope as the library's `styles.css`, and the two values must agree or
 * whichever stylesheet loads last silently wins — without the preset, the
 * ds-components default dangles on an undefined `--font-geist-mono` and the
 * form's mono cells fall back to the inherited sans face.
 */
const checkedPetrinautPandaPreset: Preset = petrinautPandaPreset as Preset;

/**
 * Extracts utility classes from the website's own source. The petrinaut library
 * ships a prebuilt `@hashintel/petrinaut/styles.css` covering its components;
 * this config emits a supplementary stylesheet for any `css()` calls in this
 * app. Layer order matches the library so utilities cascade together.
 */
export default defineConfig({
  ...scopedConfig,
  presets: [...scopedConfig.presets, checkedPetrinautPandaPreset],
  include: ["./src/**/*.{ts,tsx,js,jsx}"],
  exclude: [],
  polyfill: true,
  importMap: "@hashintel/ds-helpers",
});
