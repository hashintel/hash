import path from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

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
  ],
  optimizeDeps: {
    include: ["@babel/standalone"],
  },
});
