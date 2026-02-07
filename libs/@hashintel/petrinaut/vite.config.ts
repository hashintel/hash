import path from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

export default defineConfig(({ mode }) => {
  const isLibMode = mode === "lib" || !!process.env.VITEST;

  const environment = process.env.VITE_VERCEL_ENV ?? "development";
  const sentryDsn: string | undefined = process.env.SENTRY_DSN;

  return {
    root: isLibMode ? undefined : "demo-site",

    // Use relative paths for library assets (fixes worker URL in webpack consumers)
    // base: isLibMode ? "./" : undefined,

    resolve: {
      // Prefer browser exports from packages
      // conditions: ["browser", "import", "module"],
      alias: {
        // Provide browser-safe stubs for Node.js builtins used by TypeScript compiler
        os: path.resolve(__dirname, "src/stubs/os.ts"),
        fs: path.resolve(__dirname, "src/stubs/node-noop.ts"),
        path: path.resolve(__dirname, "src/stubs/node-noop.ts"),
        module: path.resolve(__dirname, "src/stubs/node-noop.ts"),
        perf_hooks: path.resolve(__dirname, "src/stubs/node-noop.ts"),
      },
    },

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
      // Stub Node.js globals to enable tree-shaking of Node.js-specific codepaths
      "process.versions": JSON.stringify({ pnp: undefined }),
      "process.platform": JSON.stringify("browser"),
      "process.env.NODE_ENV": JSON.stringify("production"),
    },
    optimizeDeps: {
      include: ["@babel/standalone"],
    },
  };
});
