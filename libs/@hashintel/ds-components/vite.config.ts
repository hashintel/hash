import { defineConfig } from "vite";
import svgr from "vite-plugin-svgr";

export default defineConfig({
  // Ladle points at this file from `.ladle/config.mjs`. Keep it limited to shared demo/build concerns.
  css: {
    postcss: "./postcss.config.cjs",
  },
  plugins: [svgr({ include: "**/*.svg" })],
});
