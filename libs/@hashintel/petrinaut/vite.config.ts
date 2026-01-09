import path from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import dts from "vite-plugin-dts";

export default defineConfig(({ mode }) => {
  const isLibMode = mode === "lib" || !!process.env.VITEST;

  // Load environment variables from .env files
  const env = loadEnv(mode, process.cwd(), "");

  const environment = env.VITE_VERCEL_ENV ?? "development";
  const sentryDsn: string | undefined = env.SENTRY_DSN;

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
      __ENVIRONMENT__: JSON.stringify(environment),
      __SENTRY_DSN__: JSON.stringify(sentryDsn),
      // Provide minimal process shim for TypeScript language service in browser
      "process.versions": JSON.stringify({ pnp: undefined }),
    },
    optimizeDeps: {
      include: ["@babel/standalone"],
    },
  };
});
