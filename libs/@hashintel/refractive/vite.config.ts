import babel from "@rolldown/plugin-babel";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { dts } from "rolldown-plugin-dts";
import { defineConfig } from "vite";

export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    babel({
      presets: [
        reactCompilerPreset({
          target: "19",
          compilationMode: "infer",
          // @ts-expect-error - panicThreshold is accepted at runtime
          panicThreshold: "critical_errors",
        }),
      ],
    }),

    command === "build" &&
      dts({ tsgo: true }).map((plugin) =>
        // Ensure runs before Vite's native TypeScript transform
        plugin.name.endsWith("fake-js")
          ? { ...plugin, enforce: "pre" }
          : plugin,
      ),
  ],

  build: {
    lib: {
      entry: "src/main.ts",
      fileName: "index",
      formats: ["es"],
    },
    rolldownOptions: {
      external: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "react/compiler-runtime",
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
    minify: true,
  },
}));
