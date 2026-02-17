import react from "@vitejs/plugin-react";
// eslint-disable-next-line import/no-extraneous-dependencies
import { replacePlugin } from "rolldown/plugins";
import { defineConfig, esmExternalRequirePlugin } from "vite";
import dts from "vite-plugin-dts";

/**
 * Library build config
 */
export default defineConfig({
  build: {
    lib: {
      entry: "src/main.ts",
      fileName: "main",
      formats: ["es"],
    },
    rolldownOptions: {
      external: [
        "@hashintel/ds-components",
        "@hashintel/ds-helpers",
        "react",
        "react-dom",
        "reactflow",
        "typescript",
        "monaco-editor",
        "@babel/standalone",
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
  },

  worker: {
    plugins: () => [
      replacePlugin({
        // Consumer Webpack config seem to `define` `typeof window` to `"object"` by default.
        // This causes crashes in Web Workers, since `window` is not defined there.
        // To prevent this, we do this resolution on our side.
        "typeof window": '"undefined"',
      }),
    ],
  },

  plugins: [
    esmExternalRequirePlugin({
      external: [
        "elkjs",
        "react/compiler-runtime",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
      ],
    }),

    react({
      babel: {
        plugins: ["babel-plugin-react-compiler"],
      },
    }),

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
});
