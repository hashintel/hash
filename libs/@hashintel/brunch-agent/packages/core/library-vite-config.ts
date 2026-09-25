import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

/**
 * The library build and unit-test config shared by the Brunch packages.
 *
 * It lives in the core package, which the other Brunch packages depend on, so
 * `turbo prune` keeps it for each of them. Those packages list it as a `build`
 * and `test:unit` input in their `turbo.json`, because Turborepo would not
 * otherwise hash a file outside the package.
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
  // SKILL.md imports stay imports: the consuming Flue application packages each skill directory.
  const isExternal = (moduleId: string): boolean =>
    moduleId.startsWith("node:") ||
    moduleId.endsWith("/SKILL.md") ||
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
      include: ["test/**/*.test.ts"],
    },
  });
};
