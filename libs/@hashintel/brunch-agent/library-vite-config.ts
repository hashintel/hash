import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defaultClientConditions, defaultServerConditions } from "vite";
import { defineConfig } from "vitest/config";

/** Resolves Brunch workspace packages, this one included, to their source. */
const workspaceSourceCondition = "@dev/source";

/**
 * The library build and unit-test config.
 *
 * @param packageUrl the calling config's `import.meta.url`
 * @param entries output entry name to package-relative source path
 */
export const defineBrunchLibraryConfig = (
  packageUrl: string,
  entries: Readonly<Record<string, string>>,
) => {
  const packageManifest = JSON.parse(
    readFileSync(new URL("package.json", packageUrl), "utf8"),
  ) as {
    readonly name: string;
    readonly dependencies?: Readonly<Record<string, string>>;
    readonly peerDependencies?: Readonly<Record<string, string>>;
  };
  // The package's own name stays external, so `./client` and `./ui` load
  // the contracts from the root entry's output rather than a second copy.
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

  return defineConfig({
    build: {
      lib: {
        entry: Object.fromEntries(
          Object.entries(entries).map(([name, source]) => [
            name,
            fileURLToPath(new URL(source, packageUrl)),
          ]),
        ),
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
    root: fileURLToPath(new URL(".", packageUrl)),
    test: {
      include: ["src/**/*.test.{ts,tsx}"],
      setupFiles: ["./vitest.setup.ts"],
    },
  });
};
