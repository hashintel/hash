import { readdirSync, statSync } from "node:fs";
import { dirname, extname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { replacePlugin } from "rolldown/plugins";
import { dts } from "rolldown-plugin-dts";
import { defineConfig, esmExternalRequirePlugin } from "vite";

const packageRoot = dirname(fileURLToPath(import.meta.url));
const srcRoot = resolve(packageRoot, "src");

const collectEntries = (dir: string): Record<string, string> => {
  const entries: Record<string, string> = {};

  for (const entry of readdirSync(dir)) {
    const absolutePath = resolve(dir, entry);
    const stats = statSync(absolutePath);

    if (stats.isDirectory()) {
      Object.assign(entries, collectEntries(absolutePath));
      continue;
    }

    if (
      extname(absolutePath) !== ".ts" ||
      absolutePath.endsWith(".test.ts")
    ) {
      continue;
    }

    const entryName = relative(srcRoot, absolutePath)
      .replace(/\.ts$/, "")
      .split(sep)
      .join("/");

    entries[entryName] = absolutePath;
  }

  return entries;
};

export default defineConfig(({ command }) => ({
  build: {
    lib: {
      entry: collectEntries(srcRoot),
      fileName: (_format, entryName) => `${entryName}.js`,
      formats: ["es"],
    },
    rolldownOptions: {
      external: [
        "@babel/standalone",
        "vscode-languageserver-types",
      ],
    },
    sourcemap: true,
    minify: true,
    emptyOutDir: true,
  },

  define: {
    "process.versions": JSON.stringify({ pnp: undefined }),
  },

  worker: {
    plugins: () => [
      replacePlugin({
        "typeof window": '"undefined"',
        "typeof process": "'undefined'",
        "typeof process.versions.pnp": "'undefined'",
      }),
      replacePlugin(
        { "isNodeLikeSystem()": "false" },
        { delimiters: ["(?<!function )\\b", ""] },
      ),
    ],
  },

  plugins: [
    esmExternalRequirePlugin({
      external: ["typescript"],
    }),

    command === "build" &&
      dts({ tsgo: true }).map((plugin) =>
        plugin.name.endsWith("fake-js")
          ? { ...plugin, enforce: "pre" }
          : plugin,
      ),
  ],

  experimental: {
    renderBuiltUrl: (filename) => {
      if (filename.includes(".worker")) {
        return `./${filename}`;
      }
      return filename;
    },
  },
}));
