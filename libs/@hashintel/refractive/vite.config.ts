import path from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

// Dependencies that should not be bundled into the library
const external = [
  "canvas",
  "motion",
  "motion/react",
  "react",
  "react-dom",
  "react/jsx-runtime",
  "react/jsx-dev-runtime",
];

export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: ["babel-plugin-react-compiler"],
      },
    }),
    dts({
      rollupTypes: true,
      insertTypesEntry: true,
      exclude: ["**/*.test.*", "**/*.spec.*"],
      copyDtsFiles: false,
      outDir: "dist",
    }),
  ],
  build: {
    lib: {
      entry: {
        filter: path.resolve(__dirname, "src/components/filter.tsx"),
        "flexible-filter": path.resolve(
          __dirname,
          "src/components/flexible-filter.tsx",
        ),
        "refractive-pane": path.resolve(
          __dirname,
          "src/components/refractive-pane.tsx",
        ),
        "surface-equations": path.resolve(
          __dirname,
          "src/surface-equations.ts",
        ),
        "use-motion-resize-observer": path.resolve(
          __dirname,
          "src/use-motion-resize-observer.ts",
        ),
      },
      name: "@hashintel/refractive",
      formats: ["es"],
      fileName: "index",
    },
    rollupOptions: {
      external,
      output: {
        globals: {
          react: "React",
          "react-dom": "ReactDOM",
        },
        entryFileNames: "[name].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name][extname]",
      },
      onwarn(warning, warn) {
        // Skip warnings for "use client". Will be fixed in future Vite/Rollup versions
        if (warning.code === "MODULE_LEVEL_DIRECTIVE") {
          return;
        }
        // Use default for everything else
        warn(warning);
      },
    },
    sourcemap: true,
    emptyOutDir: true,
    minify: false,
  },
});
