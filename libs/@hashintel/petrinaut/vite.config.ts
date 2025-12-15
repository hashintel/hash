import path from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

export default defineConfig(({ command, mode }) => {
  const isLibBuild = command === "build" && mode !== "site";

  return {
    root: isLibBuild ? undefined : "demo-site",

    build: isLibBuild
      ? {
          lib: {
            entry: path.resolve(__dirname, "src/main.ts"),
            name: "Petrinaut",
            fileName: "main",
            formats: ["es"],
          },
          rollupOptions: {
            external: [
              "@hashintel/ds-components",
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
      : {
          outDir: "demo-site/dist",
        },

    plugins: [
      react({
        babel: {
          plugins: ["babel-plugin-react-compiler"],
        },
      }),

      isLibBuild &&
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
    },
    optimizeDeps: {
      include: ["@babel/standalone"],
    },
  };
});
