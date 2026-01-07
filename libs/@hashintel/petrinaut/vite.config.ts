import path from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import dts from "vite-plugin-dts";

export default defineConfig(({ mode }) => {
  const isLibMode = mode === "lib" || !!process.env.VITEST;

  // Load environment variables from .env files
  // For demo-site builds, load from the package root directory
  const envDir = isLibMode ? undefined : path.resolve(__dirname);
  const env = loadEnv(mode, envDir ?? process.cwd(), "");

  // Get SENTRY_DSN from environment variables
  const sentryDsn = env.SENTRY_DSN ?? process.env.SENTRY_DSN;

  return {
    root: isLibMode ? undefined : "demo-site",

    build: isLibMode
      ? // Library build
        {
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
        }
      : // Website build
        {
          outDir: "dist",
        },

    plugins: [
      react({
        babel: {
          plugins: ["babel-plugin-react-compiler"],
        },
      }),

      isLibMode &&
        dts({
          rollupTypes: true,
          insertTypesEntry: true,
          exclude: [
            "**/*.test.*",
            "**/*.spec.*",
            "playground/**",
            "stories/**",
            ".storybook/**",
            "styled-system/**",
            "demo-site/**",
          ],
          copyDtsFiles: false,
          outDir: "dist",
        }),
    ],

    define: {
      // Provide minimal process shim for TypeScript language service in browser
      "process.versions": JSON.stringify({ pnp: undefined }),
      // Expose SENTRY_DSN at build time
      "import.meta.env.SENTRY_DSN": JSON.stringify(sentryDsn),
    },
    optimizeDeps: {
      include: ["@babel/standalone"],
    },
  };
});
