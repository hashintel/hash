import { defineConfig } from "vite";

export default defineConfig({
  // Storybook loads this file automatically; Ladle points at it from
  // `.ladle/config.mjs`. Keep it limited to shared demo/build concerns.
  css: {
    postcss: "./postcss.config.cjs",
  },
});
