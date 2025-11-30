import path from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

// Dependencies that should not be bundled into the library
const external = [
  "canvas",
  "react",
  "react-dom",
  "react/jsx-runtime",
  "react/jsx-dev-runtime",
];

export default defineConfig(({ command }) => ({
  // Use playground as root in dev mode
  root: command === "serve" ? "playground" : undefined,

  plugins: [
    react({
      babel: {
        plugins: ["babel-plugin-react-compiler"],
      },
    }),
    // Only generate types when building
    command === "build" &&
      dts({
        rollupTypes: true,
        insertTypesEntry: true,
        exclude: ["**/*.test.*", "**/*.spec.*", "playground/**"],
        copyDtsFiles: false,
        outDir: "dist",
      }),
  ],

  build:
    command === "build"
      ? {
          lib: {
            entry: path.resolve(__dirname, "src/hoc/refractive.tsx"),
            formats: ["es", "cjs"],
            fileName: (format) => `index.${format === "es" ? "js" : "cjs"}`,
          },
          rollupOptions: {
            external,
            output: [
              {
                format: "es",
                exports: "named",
                globals: {
                  react: "React",
                  "react-dom": "ReactDOM",
                },
              },
              {
                format: "cjs",
                exports: "named",
                globals: {
                  react: "React",
                  "react-dom": "ReactDOM",
                },
              },
            ],
          },
          sourcemap: true,
          emptyOutDir: true,
          minify: true,
        }
      : undefined,
}));
