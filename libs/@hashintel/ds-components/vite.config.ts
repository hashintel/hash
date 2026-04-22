import { defineConfig } from "vite";

export default defineConfig({
  // Storybook's Vite builder automatically loads this file.
  // Keep it minimal so Storybook gets Panda's PostCSS pipeline without inheriting
  // a second, stale library-build definition.
  css: {
    postcss: "./postcss.config.cjs",
  },
});
