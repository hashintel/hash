import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import MagicString from "magic-string";
import { defineConfig } from "vite";

const root = fileURLToPath(new URL("../../", import.meta.url));

export default defineConfig({
  root,
  plugins: [
    {
      name: "monaco-benchmark-instrumentation",
      enforce: "pre",
      transform(code, id) {
        const source = new MagicString(code);
        if (id.endsWith("/src/ui/monaco/provider.tsx")) {
          source.replace(
            "monacoReact.loader.config({ monaco });",
            "globalThis.__monacoBench?.install(monaco);\n  monacoReact.loader.config({ monaco });",
          );
        }
        if (id.endsWith("/src/ui/monaco/code-editor.tsx")) {
          source.replace(
            "handleMountRef.current(editorInstance, monacoInstance)",
            "(handleMountRef.current(editorInstance, monacoInstance), globalThis.__monacoBench?.ready(editorInstance))",
          );
        }
        return source.hasChanged()
          ? {
              code: source.toString(),
              map: source.generateMap({
                source: id,
                includeContent: true,
                hires: true,
              }),
            }
          : null;
      },
    },
    react({
      exclude: [
        /[\\/]node_modules[\\/]/,
        /[\\/]libs[\\/]@hashintel[\\/][^\\/]+[\\/]dist[\\/]/,
      ],
      compiler: {
        target: "19",
        compilationMode: "infer",
        panicThreshold: "all_errors",
      },
    }),
  ],
  build: {
    outDir: "benchmarks/monaco-performance/output",
    emptyOutDir: true,
    sourcemap: true,
    cssMinify: "esbuild",
    rolldownOptions: {
      input: `${root}/benchmarks/monaco-performance/bench.html`,
    },
  },
  server: { host: "127.0.0.1", port: 6026, strictPort: true },
  preview: { host: "127.0.0.1", port: 6027, strictPort: true },
});
