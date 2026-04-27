import { defineConfig } from "vite";

export default defineConfig({
  // Ladle points at this file from `.ladle/config.mjs`. Keep it limited to shared demo/build concerns.
  css: {
    postcss: "./postcss.config.cjs",
  },
});
