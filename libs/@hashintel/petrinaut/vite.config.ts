import react from "@vitejs/plugin-react";
import { dts } from "rolldown-plugin-dts";
import { defineConfig, esmExternalRequirePlugin } from "vite";

const declarationFilePattern = /\.d\.[cm]?ts$/;

const externalDependencies = [
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
] as const;

const isExternalDependency = (id: string) =>
  externalDependencies.some((dependency) =>
    typeof dependency === "string" ? id === dependency : dependency.test(id),
  );

/**
 * Library build config
 */
export default defineConfig(({ command }) => ({
  build: {
    lib: {
      // Public entry points: the legacy `main` (back-compat), the React/UI
      // split per RFC 0001, and a Preview entry that excludes editor-only
      // providers. Each emits its own JS + dts bundle.
      entry: {
        main: "src/main.ts",
        react: "src/react/index.ts",
        ui: "src/ui/index.ts",
        preview: "src/preview.ts",
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
      external: (id, importer) =>
        isExternalDependency(id) ||
        // Keep the AI SDK's transitive declaration graph out of Petrinaut's
        // bundled types without externalizing its runtime JavaScript.
        (id === "ai" &&
          importer !== undefined &&
          declarationFilePattern.test(importer)),
    },
    sourcemap: true,
    minify: true,
    // Vite 8 defaults to LightningCSS which is still unstable.
    // e.g. https://github.com/parcel-bundler/lightningcss/issues/695
    cssMinify: "esbuild",
  },

  // rolldown-plugin-dts emits declaration modules that Vite must not
  // transform as JavaScript. Setting this replaces Vite's default exclusions.
  oxc: {
    exclude: [/\.js$/, declarationFilePattern],
  },

  plugins: [
    esmExternalRequirePlugin({
      external: [
        "react/compiler-runtime",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
      ],
    }),

    react({
      // Default excludes node_modules. Also skip workspace `dist/` outputs:
      // those are pre-bundled JSX → `jsx(tag, { ref, ... })` calls, and
      // React Compiler flags the inlined `ref` prop as "Passing a ref to a
      // function" (the rule fires for `jsx()` calls but not raw JSX).
      exclude: [
        /[\\/]node_modules[\\/]/,
        /[\\/]libs[\\/]@hashintel[\\/][^\\/]+[\\/]dist[\\/]/,
        declarationFilePattern,
        /^0rolldown\/runtime\.js$/,
      ],
      compiler: {
        target: "19",
        compilationMode: "infer",
        panicThreshold: "critical_errors",
      },
    }),

    command === "build" && dts({ generator: "tsgo" }),
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
