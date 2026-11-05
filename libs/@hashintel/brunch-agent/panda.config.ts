import { defineConfig, type Preset } from "@pandacss/dev";

import { scopedThemeConfig } from "@hashintel/ds-components/preset";
import { petrinautPandaPreset } from "@hashintel/petrinaut/panda-preset";

const scopedConfig = scopedThemeConfig(".petrinaut-root");

/** The Petrinaut preset is deliberately untyped; checked as in the website. */
const checkedPetrinautPandaPreset: Preset = petrinautPandaPreset as Preset;

/**
 * Config for `panda ship`, which emits `dist/panda.buildinfo.json`: the
 * static analysis of `./ui`'s `css()` calls. Hosts (the Petrinaut website,
 * later HASH) add that file to their Panda `include`, as they do Petrinaut's,
 * so Brunch's utilities are generated in the host's own stylesheet. The theme
 * matches the website's, where `./ui` was extracted before it moved here.
 */
export default defineConfig({
  ...scopedConfig,
  presets: [...scopedConfig.presets, checkedPetrinautPandaPreset],
  include: ["./src/ui/**/*.{ts,tsx}"],
  exclude: ["./src/**/*.test.{ts,tsx}"],
  polyfill: true,
  importMap: "@hashintel/ds-helpers",
});
