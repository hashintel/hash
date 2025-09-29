import { resolve } from "path";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

export default defineConfig({
  plugins: [
    dts({
      insertTypesEntry: true,
      exclude: ["**/*.test.*", "**/*.spec.*"],
    }),
  ],
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      name: "HashComponentLibrary",
      formats: ["es"],
      fileName: "index",
    },
    rollupOptions: {
      external: ["react", "react-dom"],
      output: {
        globals: {
          react: "React",
          "react-dom": "ReactDOM",
        },
      },
      onwarn(warning, warn) {
        // Skip warnings for "use client". Will be fixed in future Vite/Rollup versions
        if (warning.code === "MODULE_LEVEL_DIRECTIVE") return;
        // Use default for everything else
        warn(warning);
      },
    },
    sourcemap: true,
  },
});
