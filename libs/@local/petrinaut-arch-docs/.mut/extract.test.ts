import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { extract } from "./extract";

import type { ArchitecturePackage } from "./model";

/**
 * The extractor walks a real directory tree, so these tests build small trees in
 * a temp dir. Inheritance is the part most worth pinning down: it is what makes
 * ~40 declarations cover 400 files, and a regression there would silently
 * re-bucket files rather than fail loudly.
 */

let root: string;

const pkg: ArchitecturePackage = {
  name: "@test/pkg",
  path: "pkg",
  description: "test package",
  language: "typescript",
  sourceDirectory: "src",
};

const write = async (relativePath: string, contents: string): Promise<void> => {
  const absolute = join(root, relativePath);
  await mkdir(join(absolute, ".."), { recursive: true });
  await writeFile(absolute, contents, "utf8");
};

const run = async () =>
  extract({
    repoRoot: root,
    packages: [pkg],
    ignoredDirectories: ["node_modules"],
    ignoredFilePattern: /\.test\.ts$/u,
  });

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "arch-docs-extract-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("extract", () => {
  it("assigns files to the nearest declaring ancestor", async () => {
    await write(
      "pkg/src/README.md",
      "---\nlayer: core\nrole: Root\n---\n\nRoot prose.\n",
    );
    await write(
      "pkg/src/engine/README.md",
      "---\nlayer: core.engine\nrole: Engine\n---\n",
    );
    await write("pkg/src/top.ts", "export const a = 1;\n");
    await write("pkg/src/engine/step.ts", "export const b = 2;\n");
    await write("pkg/src/engine/deep/nested.ts", "export const c = 3;\n");

    const { layers, fileLayers, diagnostics } = await run();

    expect(diagnostics).toEqual([]);
    expect(fileLayers.get("pkg/src/top.ts")).toBe("core");
    expect(fileLayers.get("pkg/src/engine/step.ts")).toBe("core.engine");
    // Inherits through a folder that declares nothing of its own.
    expect(fileLayers.get("pkg/src/engine/deep/nested.ts")).toBe("core.engine");

    const engine = layers.find((layer) => layer.id === "core.engine");
    expect(engine?.fileCount).toBe(2);
    expect(layers.find((layer) => layer.id === "core")?.fileCount).toBe(1);
  });

  it("captures README prose as the layer body", async () => {
    await write(
      "pkg/src/README.md",
      "---\nlayer: core\nrole: Root\n---\n\n# Title\n\nBody text.\n",
    );
    await write("pkg/src/a.ts", "export const a = 1;\n");

    const { layers } = await run();

    expect(layers[0]?.prose).toBe("# Title\n\nBody text.");
  });

  it("declares a layer from a @layerRoot entry file", async () => {
    await write(
      "pkg/src/index.ts",
      `/**\n * @layerRoot core\n * @layerName Core\n * @role Does the thing\n */\nexport const a = 1;\n`,
    );

    const { layers, diagnostics } = await run();

    expect(diagnostics).toEqual([]);
    expect(layers).toHaveLength(1);
    expect(layers[0]?.name).toBe("Core");
    expect(layers[0]?.role).toBe("Does the thing");
    expect(layers[0]?.declaredIn).toBe("pkg/src/index.ts");
  });

  it("requires a role alongside @layerRoot", async () => {
    await write(
      "pkg/src/index.ts",
      `/**\n * @layerRoot core\n */\nexport const a = 1;\n`,
    );

    const { diagnostics } = await run();

    expect(
      diagnostics.some((diagnostic) => diagnostic.message.includes("@role")),
    ).toBe(true);
  });

  it("does not double-count tags on the declaring file", async () => {
    await write(
      "pkg/src/index.ts",
      `/**\n * @layerRoot core\n * @role Root\n * @boundary worker — nothing crosses\n * @invariant Holds\n */\nexport const a = 1;\n`,
    );

    const { layers } = await run();

    expect(layers[0]?.boundaries).toHaveLength(1);
    expect(layers[0]?.invariants).toHaveLength(1);
  });

  it("folds file-level boundaries and invariants onto the inherited layer", async () => {
    await write("pkg/src/README.md", "---\nlayer: core\nrole: Root\n---\n");
    await write(
      "pkg/src/worker.ts",
      `/**\n * @boundary worker — buffers stay put\n * @invariant Bounded memory\n * @entryPoint @test/pkg\n */\nexport const a = 1;\n`,
    );

    const { layers } = await run();

    expect(layers[0]?.boundaries).toEqual([
      {
        kind: "worker",
        note: "buffers stay put",
        source: "pkg/src/worker.ts",
        line: 2,
      },
    ]);
    expect(layers[0]?.invariants[0]?.text).toBe("Bounded memory");
    expect(layers[0]?.entryPoints).toEqual(["@test/pkg"]);
  });

  it("lets a single file override its inherited layer", async () => {
    await write("pkg/src/README.md", "---\nlayer: core\nrole: Root\n---\n");
    await write(
      "pkg/src/engine/README.md",
      "---\nlayer: core.engine\nrole: Engine\n---\n",
    );
    await write(
      "pkg/src/misplaced.ts",
      `/**\n * @layer core.engine\n */\nexport const a = 1;\n`,
    );

    const { fileLayers } = await run();

    expect(fileLayers.get("pkg/src/misplaced.ts")).toBe("core.engine");
  });

  it("reports an @layer pointing at an undeclared layer", async () => {
    await write("pkg/src/README.md", "---\nlayer: core\nrole: Root\n---\n");
    await write(
      "pkg/src/a.ts",
      `/**\n * @layer core.nope\n */\nexport const a = 1;\n`,
    );

    const { diagnostics } = await run();

    expect(
      diagnostics.some((diagnostic) =>
        diagnostic.message.includes("is not a declared layer"),
      ),
    ).toBe(true);
  });

  it("reports a file that no declaration covers", async () => {
    await write("pkg/src/orphan.ts", "export const a = 1;\n");

    const { diagnostics } = await run();

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.message).toContain("no layer resolves");
  });

  it("rejects two declarations on one folder", async () => {
    await write("pkg/src/README.md", "---\nlayer: core\nrole: Root\n---\n");
    await write(
      "pkg/src/index.ts",
      `/**\n * @layerRoot core.other\n * @role Other\n */\nexport const a = 1;\n`,
    );

    const { diagnostics } = await run();

    expect(
      diagnostics.some((diagnostic) =>
        diagnostic.message.includes("may declare at most one layer"),
      ),
    ).toBe(true);
  });

  it("rejects the same layer id declared twice", async () => {
    await write("pkg/src/README.md", "---\nlayer: core\nrole: Root\n---\n");
    await write("pkg/src/a/README.md", "---\nlayer: core\nrole: Dup\n---\n");

    const { diagnostics } = await run();

    expect(
      diagnostics.some((diagnostic) =>
        diagnostic.message.includes("is already declared in"),
      ),
    ).toBe(true);
  });

  it("lists non-declaring markdown as references", async () => {
    await write("pkg/src/README.md", "---\nlayer: core\nrole: Root\n---\n");
    await write("pkg/src/BUFFER_ABI.md", "# ABI\n\nDetails.\n");
    await write("pkg/src/a.ts", "export const a = 1;\n");

    const { layers } = await run();

    expect(layers[0]?.references).toEqual(["pkg/src/BUFFER_ABI.md"]);
  });

  it("excludes files matching the ignore pattern", async () => {
    await write("pkg/src/README.md", "---\nlayer: core\nrole: Root\n---\n");
    await write("pkg/src/a.ts", "export const a = 1;\n");
    await write("pkg/src/a.test.ts", "export const b = 2;\n");

    const { layers, fileLayers } = await run();

    expect(layers[0]?.fileCount).toBe(1);
    expect(fileLayers.has("pkg/src/a.test.ts")).toBe(false);
  });

  it("counts non-blank lines only", async () => {
    await write("pkg/src/README.md", "---\nlayer: core\nrole: Root\n---\n");
    await write("pkg/src/a.ts", "const a = 1;\n\n\nconst b = 2;\n");

    const { layers } = await run();

    expect(layers[0]?.lineCount).toBe(2);
  });

  it("produces layers sorted by id, so output is stable", async () => {
    await write("pkg/src/README.md", "---\nlayer: core\nrole: Root\n---\n");
    await write("pkg/src/z/README.md", "---\nlayer: core.z\nrole: Z\n---\n");
    await write("pkg/src/a/README.md", "---\nlayer: core.a\nrole: A\n---\n");
    await write("pkg/src/a/f.ts", "export const a = 1;\n");
    await write("pkg/src/z/f.ts", "export const a = 1;\n");

    const { layers } = await run();

    expect(layers.map((layer) => layer.id)).toEqual([
      "core",
      "core.a",
      "core.z",
    ]);
  });

  it("derives the parent id from the dotted layer id", async () => {
    await write("pkg/src/README.md", "---\nlayer: core\nrole: Root\n---\n");
    await write(
      "pkg/src/a/b/README.md",
      "---\nlayer: core.a.b\nrole: Deep\n---\n",
    );
    await write("pkg/src/a/b/f.ts", "export const a = 1;\n");

    const { layers } = await run();

    expect(layers.find((layer) => layer.id === "core")?.parent).toBeNull();
    expect(layers.find((layer) => layer.id === "core.a.b")?.parent).toBe(
      "core.a",
    );
  });
});
