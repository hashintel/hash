import babel from "@rolldown/plugin-babel";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { dts } from "rolldown-plugin-dts";
import { defineConfig, esmExternalRequirePlugin } from "vite";

/**
 * Library build config
 */
export default defineConfig(({ command }) => ({
  build: {
    lib: {
      // Three entry points: the legacy `main` (back-compat), plus the
      // React/UI split per RFC 0001. Each emits its own JS + dts bundle.
      entry: {
        main: "src/main.ts",
        react: "src/react/index.ts",
        ui: "src/ui/index.ts",
        // Panda preset consumed by hosts that compile Petrinaut's styles
        // through their own Panda pipeline (see panda.ship.config.ts).
        "panda-preset": "src/panda-preset.ts",
      },
      fileName: (_format, entryName) => `${entryName}.js`,
      // Emit the bundled CSS as `main.css` so the package.json `style` field
      // and the `./styles.css` / `./dist/main.css` exports resolve. Without
      // this vite uses the package name (`petrinaut.css`).
      cssFileName: "main",
      formats: ["es"],
    },
    rolldownOptions: {
      external: [
        "@hashintel/ds-components",
        "@hashintel/ds-helpers",
        /^@hashintel\/petrinaut-core(\/.*)?$/,
        "react",
        "react-dom",
        "@xyflow/react",
        "@babel/standalone",
        // Pure-CJS dep pulled in transitively by @tanstack/react-form →
        // @tanstack/react-store. Rolldown can't safely transform its
        // `require("react")` when react is external, so it falls back to a
        // runtime require helper that throws in the browser. Externalising it
        // pushes CJS→ESM interop to the consumer's bundler.
        /^use-sync-external-store(\/.*)?$/,
      ],
      output: {
        globals: {
          react: "React",
          "react-dom": "ReactDOM",
        },
      },
    },
    sourcemap: true,
    minify: true,
    // Vite 8 defaults to LightningCSS which is still unstable.
    // e.g. https://github.com/parcel-bundler/lightningcss/issues/695
    cssMinify: "esbuild",
  },

  plugins: [
    esmExternalRequirePlugin({
      external: [
        "react/compiler-runtime",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
      ],
    }),

    react(),
    babel({
      // Default excludes node_modules. Also skip workspace `dist/` outputs:
      // those are pre-bundled JSX → `jsx(tag, { ref, ... })` calls, and
      // React Compiler flags the inlined `ref` prop as "Passing a ref to a
      // function" (the rule fires for `jsx()` calls but not raw JSX).
      exclude: [
        /[\\/]node_modules[\\/]/,
        /[\\/]libs[\\/]@hashintel[\\/][^\\/]+[\\/]dist[\\/]/,
        /^0rolldown\/runtime\.js$/,
      ],
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

  experimental: {
    renderBuiltUrl: (filename) => {
      // Fix worker URL for Webpack consumers
      // Using `config.base` adds `"" +` prefix to the URL, which breaks the worker URL
      if (filename.includes(".worker")) {
        return `./${filename}`;
      }
      return filename;
    },
  },
}));
