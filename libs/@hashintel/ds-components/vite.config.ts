import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import svgr from "vite-plugin-svgr";

// Ladle runs this config on its own bundled Vite 6, where plugin-react 6's
// rolldown-native fast-refresh plugin breaks `ladle serve` ("Missing field
// `moduleType`"). Skip the plugin there so Ladle injects its own; Ladle
// detects it in every other context (`vite:react-babel`) and adds nothing.
// `ladle build`, vitest, and plain Vite all run the React Compiler.
const isLadleServe = (command: "build" | "serve") => {
  const { VITE_LADLE_APP_ID: ladleAppId } = process.env;
  return command === "serve" && ladleAppId !== undefined;
};

export default defineConfig(({ command }) => ({
  // Ladle points at this file from `.ladle/config.mjs`. Keep it limited to shared demo/build concerns.
  build: {
    cssMinify: "esbuild",
  },
  css: {
    postcss: "./postcss.config.cjs",
  },
  plugins: [
    svgr({ include: "**/*.svg" }),
    !isLadleServe(command) &&
      react({
        compiler: {
          target: "19",
          compilationMode: "infer",
          panicThreshold: "critical_errors",
        },
      }),
  ],
}));
