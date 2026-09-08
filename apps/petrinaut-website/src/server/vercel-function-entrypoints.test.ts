/// <reference types="node" />

import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

const appRoot = fileURLToPath(new URL("../..", import.meta.url));
const entrypointPaths = [
  "api/chat.ts",
  "api/oembed.ts",
  "api/voice/config.ts",
  "api/voice/realtime-call.ts",
] as const;

const importDeclarationPattern =
  /(?:^|\n)\s*import\s+(?:[\s\S]*?\s+from\s+)?["']([^"']+)["'];?/gu;
const exportDeclarationPattern =
  /(?:^|\n)\s*export\s+(?:type\s+)?(?:\*|\{[\s\S]*?\})\s+from\s+["']([^"']+)["'];?/gu;

const staticModuleSpecifiers = (source: string): string[] => {
  const specifiers: string[] = [];

  for (const pattern of [importDeclarationPattern, exportDeclarationPattern]) {
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1];
      if (specifier !== undefined) {
        specifiers.push(specifier);
      }
    }
  }

  return specifiers;
};

const emittedPath = (outputRoot: string, sourcePath: string): string =>
  join(outputRoot, relative(appRoot, sourcePath).replace(/\.ts$/u, ".js"));

const emitNativeEsmGraph = async (
  outputRoot: string,
  sourcePath: string,
  emittedSourcePaths: Set<string>,
): Promise<void> => {
  const absoluteSourcePath = resolve(sourcePath);
  if (emittedSourcePaths.has(absoluteSourcePath)) {
    return;
  }
  emittedSourcePaths.add(absoluteSourcePath);

  const source = await readFile(absoluteSourcePath, "utf8");
  const javascript = stripTypeScriptTypes(source, {
    mode: "strip",
  });
  const outputPath = emittedPath(outputRoot, absoluteSourcePath);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, javascript);

  for (const specifier of staticModuleSpecifiers(javascript)) {
    if (!specifier.startsWith(".")) {
      continue;
    }
    if (!specifier.endsWith(".js")) {
      throw new Error(
        `${relative(appRoot, absoluteSourcePath)} imports ${specifier} without a .js extension`,
      );
    }

    const importedSourcePath = resolve(
      dirname(absoluteSourcePath),
      specifier.replace(/\.js$/u, ".ts"),
    );
    await emitNativeEsmGraph(
      outputRoot,
      importedSourcePath,
      emittedSourcePaths,
    );
  }
};

describe("Petrinaut Vercel Function entrypoints", () => {
  it("loads every local import graph with native Node ESM resolution", async () => {
    const temporaryParent = join(appRoot, ".turbo");
    await mkdir(temporaryParent, { recursive: true });
    const outputRoot = await mkdtemp(
      join(temporaryParent, "vercel-function-entrypoints-"),
    );

    try {
      await writeFile(
        join(outputRoot, "package.json"),
        `${JSON.stringify({ type: "module" })}\n`,
      );

      const emittedSourcePaths = new Set<string>();
      for (const entrypointPath of entrypointPaths) {
        await emitNativeEsmGraph(
          outputRoot,
          resolve(appRoot, entrypointPath),
          emittedSourcePaths,
        );
      }

      const importScript = entrypointPaths
        .map((entrypointPath) => {
          const outputPath = emittedPath(
            outputRoot,
            resolve(appRoot, entrypointPath),
          );
          return `await import(${JSON.stringify(pathToFileURL(outputPath).href)});`;
        })
        .join("\n");
      const result = spawnSync(
        process.execPath,
        ["--input-type=module", "--eval", importScript],
        {
          cwd: appRoot,
          encoding: "utf8",
          env: { ...process.env, NODE_NO_WARNINGS: "1" },
        },
      );

      expect(result.stderr).toBe("");
      expect(result.status).toBe(0);
    } finally {
      await rm(outputRoot, { force: true, recursive: true });
    }
  });
});
