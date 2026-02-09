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
    base: isLibMode ? "./" : undefined,

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

      // Vite lib mode emits worker URLs as `"" + new URL("assets/...", import.meta.url).href`
      // wrapped in an outer `new URL(...)`. Simplify to `new URL("assets/...", import.meta.url)`.
      // Also shim `window` in worker chunks: @babel/standalone bundles the `debug` package
      // which accesses `window` in its `useColors()` without a typeof guard.
      isLibMode && {
        name: "fix-worker-bundle",
        generateBundle(_, bundle) {
          for (const [fileName, item] of Object.entries(bundle)) {
            if (item.type === "chunk") {
              item.code = item.code.replace(
                /new URL\(\s*\/\* @vite-ignore \*\/\s*"" \+ new URL\(("assets\/[^"]+"), import\.meta\.url\)\.href,\s*import\.meta\.url\s*\)/g,
                "new URL($1, import.meta.url)",
              );
            }

            // Prepend window shim to worker bundles so libraries that
            // access `window` (e.g. debug's useColors in @babel/standalone)
            // work in Web Workers
            if (fileName.includes("worker")) {
              if (item.type === "chunk") {
                item.code = `self.window = self;\n${item.code}`;
              } else if (
                item.type === "asset" &&
                typeof item.source === "string"
              ) {
                item.source = `self.window = self;\n${item.source}`;
              }
            }
          }
        },
      },

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
