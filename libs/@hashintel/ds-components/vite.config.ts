import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import svgr from "vite-plugin-svgr";

export default defineConfig({
  // Storybook merges this config via @storybook/react-vite. Keep it limited to shared demo/build concerns.
  build: {
    cssMinify: "esbuild",
  },
  css: {
    postcss: "./postcss.config.cjs",
  },
  plugins: [
    svgr({ include: "**/*.svg" }),
    react({
      compiler: {
        target: "19",
        compilationMode: "infer",
        panicThreshold: "all_errors",
      },
    }),
  ],
});
