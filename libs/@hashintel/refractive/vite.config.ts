import path from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

// Dependencies that should not be bundled into the library
const external = [
  "react",
  "react-dom",
  "react/jsx-runtime",
  "react/jsx-dev-runtime",
  "react/compiler-runtime",
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
      exclude: ["**/*.test.*", "**/*.spec.*", "stories/**"],
      copyDtsFiles: false,
      outDir: "dist",
    }),
  ],

  build: {
    lib: {
      entry: path.resolve(__dirname, "src/main.ts"),
      formats: ["es", "cjs"],
      fileName: (format) => `index.${format === "es" ? "js" : "cjs"}`,
    },
    rollupOptions: {
      external,
      output: {
        globals: {
          react: "React",
          "react-dom": "ReactDOM",
        },
      },
    },
    sourcemap: true,
    emptyOutDir: true,
    minify: true,
  },
});
