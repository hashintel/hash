import babel from "@rolldown/plugin-babel";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { replacePlugin } from "rolldown/plugins";
import { dts } from "rolldown-plugin-dts";
import { defineConfig, esmExternalRequirePlugin } from "vite";

export const libraryExternalPatterns = [
  /^@babel\/standalone$/,
  /^@hashintel\/ds-components(\/.*)?$/,
  /^@hashintel\/ds-helpers(\/.*)?$/,
  /^@xyflow\/react(\/.*)?$/,
  /^react(\/.*)?$/,
  /^react-dom(\/.*)?$/,
  /^use-sync-external-store(\/.*)?$/,
];

export function isLibraryExternal(id: string) {
  return libraryExternalPatterns.some((pattern) => pattern.test(id));
}

/**
 * Library build config
 */
export default defineConfig(({ command }) => ({
  build: {
    lib: {
      entry: "src/main.ts",
      fileName: "main",
      formats: ["es"],
    },
    rolldownOptions: {
      // Keep peer packages external by subpath too. Source imports helper
      // subpaths such as `@hashintel/ds-helpers/css`; externalizing only the
      // package root lets those internals leak into Petrinaut's emitted graph.
      external: isLibraryExternal,
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

  define: {
    "process.versions": JSON.stringify({ pnp: undefined }),
  },

  worker: {
    plugins: () => [
      replacePlugin({
        // Consumer Webpack config seem to `define` `typeof window` to `"object"` by default.
        // This causes crashes in Web Workers, since `window` is not defined there.
        "typeof window": '"undefined"',
        // TypeScript's internals reference process, process.versions.pnp, etc.
        "typeof process": "'undefined'",
        "typeof process.versions.pnp": "'undefined'",
      }),
      // Separate replacePlugin for call-expression replacements:
      // 1. Empty end delimiter because \b can't match after `)` (non-word → non-word).
      // 2. Negative lookbehind skips the function definition (`function isNodeLikeSystem`).
      replacePlugin(
        { "isNodeLikeSystem()": "false" },
        { delimiters: ["(?<!function )\\b", ""] },
      ),
    ],
  },

  plugins: [
    esmExternalRequirePlugin({
      external: [
        "elkjs",
        "react/compiler-runtime",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "typescript",
      ],
    }),

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
