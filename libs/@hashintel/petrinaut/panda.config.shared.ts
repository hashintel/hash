import { createRequire } from "node:module";

import { defineConfig } from "@pandacss/dev";
import { scopedThemeConfig } from "@hashintel/ds-components/preset";

import { CODE_FONT_FAMILY } from "./src/constants/ui";

export const DS_COMPONENTS_BUILD_INFO_SUBPATH =
  "@hashintel/ds-components/panda.buildinfo.json";

export const createNodeSpecifierResolver = (moduleLocation: string | URL) => {
  const require = createRequire(moduleLocation);

  return (specifier: string) => require.resolve(specifier);
};

export const resolveDsComponentsBuildInfoPath = (
  resolve: (specifier: string) => string,
) => resolve(DS_COMPONENTS_BUILD_INFO_SUBPATH);

export const createPetrinautPandaConfig = (dsComponentsBuildInfoPath: string) =>
  defineConfig({
    ...scopedThemeConfig(".petrinaut-root"),

    include: [
      "./src/**/*.{js,jsx,ts,tsx}",
      dsComponentsBuildInfoPath,
      "./.storybook/**/*.{js,jsx,ts,tsx}",
    ],

    exclude: [],

    theme: {
      extend: {
        tokens: {
          fonts: {
            mono: {
              value: CODE_FONT_FAMILY,
            },
          },
        },
        keyframes: {
          fadeIn: {
            from: { opacity: "0", transform: "translateY(-10px)" },
            to: { opacity: "1", transform: "translateY(0)" },
          },
          fadeOut: {
            from: { opacity: "1", transform: "translateY(0)" },
            to: { opacity: "0", transform: "translateY(-10px)" },
          },
          expand: {
            from: { height: "0", opacity: "0" },
            to: { height: "var(--height)", opacity: "1" },
          },
          collapse: {
            from: { height: "var(--height)", opacity: "1" },
            to: { height: "0", opacity: "0" },
          },
          dialogBackdropIn: {
            from: { opacity: "0" },
            to: { opacity: "1" },
          },
          dialogBackdropOut: {
            from: { opacity: "1" },
            to: { opacity: "0" },
          },
          dialogContentIn: {
            from: { opacity: "0", transform: "scale(0.95)" },
            to: { opacity: "1", transform: "scale(1)" },
          },
          dialogContentOut: {
            from: { opacity: "1", transform: "scale(1)" },
            to: { opacity: "0", transform: "scale(0.95)" },
          },
          "popover-in": {
            from: { opacity: "0", transform: "scale(0.96)" },
            to: { opacity: "1", transform: "scale(1)" },
          },
          "popover-out": {
            from: { opacity: "1", transform: "scale(1)" },
            to: { opacity: "0", transform: "scale(0.96)" },
          },
          "drawer-in": {
            from: { opacity: "0", transform: "translateX(100px)" },
            to: { opacity: "1", transform: "translateX(0)" },
          },
          "drawer-out": {
            from: { opacity: "1", transform: "translateX(0)" },
            to: { opacity: "0", transform: "translateX(100px)" },
          },
        },
      },
    },

    // Polyfill CSS @layer for embedding in HASH, where unlayered global
    // resets (* { padding: 0 }) would otherwise override layered utilities.
    polyfill: true,

    importMap: "@hashintel/ds-helpers",
  });
