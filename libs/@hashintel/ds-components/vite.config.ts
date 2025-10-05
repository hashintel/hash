import path from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

// Dependencies that should not be bundled into the library
const external = [
  "@ark-ui/react",
  "@hashintel/ds-styled-system",
  "canvas",
  "motion",
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
      exclude: ["**/*.test.*", "**/*.spec.*", "playground/**", "stories/**"],
      copyDtsFiles: false,
    }),
  ],
  build: {
    lib: {
      entry: {
        Button: path.resolve(__dirname, "src/components/Button/button.tsx"),
        RefractivePane: path.resolve(
          __dirname,
          "src/components/RefractivePane/refractive-pane.tsx"
        ),
        SegmentedControl: path.resolve(
          __dirname,
          "src/components/SegmentedControl/segmented-control.tsx"
        ),
        Slider: path.resolve(__dirname, "src/components/Slider/slider.tsx"),
        Switch: path.resolve(__dirname, "src/components/Switch/switch.tsx"),
      },
      name: "HashComponentLibrary",
      formats: ["es"],
      fileName: "index",
    },
    rollupOptions: {
      external,
      output: {
        preserveModules: true,
        preserveModulesRoot: "src",
        globals: {
          react: "React",
          "react-dom": "ReactDOM",
        },
        assetFileNames: (chunk) => {
          return chunk.name?.endsWith(".css")
            ? "styles/[name][extname]"
            : "[name][extname]";
        },
        entryFileNames: "[name].js",
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
