import { createRequire } from "node:module";

import { defineConfig, type Preset } from "@pandacss/dev";

import { scopedThemeConfig } from "@hashintel/ds-components/preset";

import { petrinautPandaPreset } from "./src/panda-preset";

/**
 * `src/panda-preset.ts` cannot import Panda's `Preset` type itself (that
 * would leak `@pandacss/dev`'s un-bundleable types into the package's `.d.ts`
 * output), so its shape is checked here instead.
 */
const checkedPetrinautPandaPreset: Preset = petrinautPandaPreset;

export const DS_COMPONENTS_BUILD_INFO_SUBPATH =
  "@hashintel/ds-components/panda.buildinfo.json";

export const createNodeSpecifierResolver = (moduleLocation: string | URL) => {
  const require = createRequire(moduleLocation);

  return (specifier: string) => require.resolve(specifier);
};

export const resolveDsComponentsBuildInfoPath = (
  resolve: (specifier: string) => string,
) => resolve(DS_COMPONENTS_BUILD_INFO_SUBPATH);

export const createPetrinautPandaConfig = (
  dsComponentsBuildInfoPath: string,
) => {
  const scopedConfig = scopedThemeConfig(".petrinaut-root");

  return defineConfig({
    ...scopedConfig,

    /**
     * Petrinaut's theme extension (keyframes, `fonts.mono`) lives in
     * `src/panda-preset.ts` — shipped as `@hashintel/petrinaut/panda-preset` —
     * so that hosts compiling Petrinaut's styles through their own Panda
     * pipeline (via `@hashintel/petrinaut/panda.buildinfo.json`) generate CSS
     * against the exact same theme contract. Listed last so it takes
     * precedence over ds-components definitions here, mirroring the previous
     * inline `theme.extend`.
     */
    presets: [...scopedConfig.presets, checkedPetrinautPandaPreset],

    include: [
      "./src/**/*.{js,jsx,ts,tsx}",
      dsComponentsBuildInfoPath,
      "./.storybook/**/*.{js,jsx,ts,tsx}",
    ],

    exclude: [],

    // Polyfill CSS @layer for embedding in HASH, where unlayered global
    // resets (* { padding: 0 }) would otherwise override layered utilities.
    polyfill: true,

    importMap: "@hashintel/ds-helpers",
  });
};
