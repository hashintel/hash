import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defaultClientConditions, defaultServerConditions } from "vite";
import { defineConfig } from "vitest/config";

import packageManifest from "./package.json" with { type: "json" };

/** Resolves Brunch workspace packages, this one included, to their source. */
const workspaceSourceCondition = "@dev/source";

// Each export that imports `./dist/<name>.js` is built as entry `<name>` from
// its source-condition path, so `exports` alone lists the entries.
const entries = Object.fromEntries(
  Object.values(packageManifest.exports).flatMap((target) => {
    if (typeof target === "string") {
      return [];
    }
    const entryName = /^\.\/dist\/(?<name>.+)\.js$/.exec(target.import)?.groups
      ?.name;
    return entryName
      ? [
          [
            entryName,
            fileURLToPath(
              new URL(target[workspaceSourceCondition], import.meta.url),
            ),
          ],
        ]
      : [];
  }),
);

// The package's own name stays external, so `./client` and `./ui` load the
// contracts from the root entry's output rather than a second copy.
const externalPackageNames = [
  packageManifest.name,
  ...Object.keys({
    ...packageManifest.dependencies,
    ...packageManifest.peerDependencies,
  }),
];

const isExternal = (moduleId: string): boolean =>
  moduleId.startsWith("node:") ||
  externalPackageNames.some(
    (packageName) =>
      moduleId === packageName || moduleId.startsWith(`${packageName}/`),
  );

export default defineConfig(({ command }) => ({
  build: {
    lib: {
      entry: entries,
      fileName: (_format, entryName) => `${entryName}.js`,
      formats: ["es"],
    },
    rolldownOptions: {
      external: isExternal,
    },
    sourcemap: true,
  },
  plugins: [
    // The React Compiler, as the website compiled `./ui` before it moved
    // here. Workspace `dist/` outputs are prebuilt `jsx()` calls the
    // compiler misreads, so they are skipped, as Petrinaut's build does.
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
  ...(command === "serve"
    ? {
        resolve: {
          conditions: [workspaceSourceCondition, ...defaultClientConditions],
        },
        // Node-environment tests resolve through SSR, which has its own
        // conditions; without the source condition this package's self-imports
        // would need its `dist`, which a test run does not build. Vitest's own
        // SSR default leaves out `module`, whose builds Node cannot import.
        ssr: {
          resolve: {
            conditions: [
              workspaceSourceCondition,
              ...defaultServerConditions.filter(
                (condition) => condition !== "module",
              ),
            ],
          },
        },
      }
    : {}),
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./vitest.setup.ts"],
  },
}));
