import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

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
    readonly dependencies?: Readonly<Record<string, string>>;
    readonly peerDependencies?: Readonly<Record<string, string>>;
  };
  const externalPackageNames = Object.keys({
    ...packageManifest.dependencies,
    ...packageManifest.peerDependencies,
  });
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
    root: fileURLToPath(new URL(".", packageUrl)),
    test: {
      include: ["src/**/*.test.ts"],
    },
  });
};
