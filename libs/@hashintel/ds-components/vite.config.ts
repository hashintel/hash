import path from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

// Dependencies that should not be bundled into the library
const external = [
  "@hashintel/ds-helpers",
  "@hashintel/ds-helpers/css",
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
    react(),
    dts({
      rollupTypes: true,
      insertTypesEntry: true,
      exclude: [
        "**/*.test.*",
        "**/*.spec.*",
        "playground/**",
        "stories/**",
        ".storybook/**",
      ],
      copyDtsFiles: false,
      outDir: "dist",
    }),
  ],
  build: {
    lib: {
      entry: {
        badge: path.resolve(__dirname, "src/components/Badge/badge.tsx"),
        button: path.resolve(__dirname, "src/components/Button/button.tsx"),
        checkbox: path.resolve(
          __dirname,
          "src/components/Checkbox/checkbox.tsx",
        ),
        "segmented-control": path.resolve(
          __dirname,
          "src/components/SegmentedControl/segmented-control.tsx",
        ),
        slider: path.resolve(__dirname, "src/components/Slider/slider.tsx"),
        switch: path.resolve(__dirname, "src/components/Switch/switch.tsx"),
      },
      name: "HashComponentLibrary",
      formats: ["es"],
      fileName: "index",
    },
    rollupOptions: {
      external,
      output: {
        // preserveModules: true,
        // preserveModulesRoot: "src",
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
