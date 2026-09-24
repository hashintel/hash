import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";

const packageRoot = fileURLToPath(new URL(".", import.meta.url));
const packageManifest = JSON.parse(
  readFileSync(new URL("package.json", import.meta.url), "utf8"),
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

export default defineConfig({
  build: {
    lib: {
      entry: {
        flue: fileURLToPath(new URL("src/flue.ts", import.meta.url)),
        index: fileURLToPath(new URL("src/index.ts", import.meta.url)),
      },
      fileName: (_format, entryName) => `${entryName}.js`,
      formats: ["es"],
    },
    rolldownOptions: {
      external: isExternal,
    },
    sourcemap: true,
  },
  root: packageRoot,
});
