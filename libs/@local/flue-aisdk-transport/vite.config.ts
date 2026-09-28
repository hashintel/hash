import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const packageManifest = JSON.parse(
  readFileSync(new URL("package.json", import.meta.url), "utf8"),
) as { readonly dependencies?: Readonly<Record<string, string>> };
const externalPackageNames = Object.keys(packageManifest.dependencies ?? {});

const sourcePath = (path: string): string =>
  fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  build: {
    lib: {
      entry: {
        client: sourcePath("src/client.ts"),
        server: sourcePath("src/server.ts"),
      },
      fileName: (_format, entryName) => `${entryName}.js`,
      formats: ["es"],
    },
    rolldownOptions: {
      external: (moduleId) =>
        moduleId.startsWith("node:") ||
        externalPackageNames.some(
          (packageName) =>
            moduleId === packageName || moduleId.startsWith(`${packageName}/`),
        ),
    },
    sourcemap: true,
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
});
