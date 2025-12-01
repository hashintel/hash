import path from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

export default defineConfig({
  build: {
    lib: {
      entry: path.resolve(__dirname, "src/main.ts"),
      name: "Petrinaut",
      fileName: "main",
      formats: ["es"],
    },
    rollupOptions: {
      external: [
        "@hashintel/ds-components",
        "@hashintel/ds-helpers",
        "elkjs",
        "react",
        "react-dom",
        "reactflow",
      ],
      output: {
        globals: {
          react: "React",
          "react-dom": "ReactDOM",
        },
      },
    },
    sourcemap: true,
    emptyOutDir: true,
    minify: false,
  },
  plugins: [
    react({
      babel: {
        plugins: ["babel-plugin-react-compiler"],
      },
    }),
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
  optimizeDeps: {
    include: ["@babel/standalone"],
  },
});
