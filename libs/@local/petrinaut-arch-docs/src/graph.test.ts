import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildGraph, resolveDeclaredEdges } from "./graph";

import type { TalksToDeclaration } from "./extract";
import type { ArchitecturePackage, Edge, Layer } from "./model";

/**
 * A declared edge is the one kind an annotation draws rather than the import
 * graph proving, so both refusals are pinned: a target nobody declared, and a
 * pair the imports already carry. Either accepted silently would let the docs
 * assert an edge the model cannot stand behind.
 */

const layer = (id: string, pkg = "@test/pkg"): Layer => ({
  id,
  name: id,
  parent: id.includes(".") ? id.slice(0, id.lastIndexOf(".")) : null,
  package: pkg,
  role: `role of ${id}`,
  declaredIn: `src/${id}/index.ts`,
  prose: null,
  references: [],
  files: [`src/${id}/index.ts`],
  fileCount: 1,
  lineCount: 1,
});

const importEdge = (from: string, to: string): Edge => ({
  from,
  to,
  provenance: "imports",
  fileDependencies: 1,
  examples: [],
  crossesPackage: false,
});

const declaration = (
  overrides: Partial<TalksToDeclaration> = {},
): TalksToDeclaration => ({
  file: "py/src/session.py",
  line: 3,
  target: "cli",
  protocol: "JSON lines over stdio",
  ...overrides,
});

const layers = [layer("bindings", "@test/py"), layer("cli", "@test/cli")];
const fileLayers = new Map([["py/src/session.py", "bindings"]]);

describe("resolveDeclaredEdges", () => {
  it("builds an edge from the declaring file's layer to the target", () => {
    const { edges, diagnostics } = resolveDeclaredEdges({
      talksTo: [declaration()],
      fileLayers,
      layers,
      importEdges: [],
    });

    expect(diagnostics).toEqual([]);
    expect(edges).toEqual([
      {
        from: "bindings",
        to: "cli",
        provenance: "declared",
        protocol: "JSON lines over stdio",
        crossesPackage: true,
      },
    ]);
  });

  it("errors when the target is not a declared layer", () => {
    const { edges, diagnostics } = resolveDeclaredEdges({
      talksTo: [declaration({ target: "clii" })],
      fileLayers,
      layers,
      importEdges: [],
    });

    expect(edges).toEqual([]);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.severity).toBe("error");
    expect(diagnostics[0]?.file).toBe("py/src/session.py");
    expect(diagnostics[0]?.line).toBe(3);
    expect(diagnostics[0]?.message).toContain("not a declared layer");
  });

  it("errors when the pair is already derived from imports", () => {
    const { edges, diagnostics } = resolveDeclaredEdges({
      talksTo: [declaration()],
      fileLayers,
      layers,
      importEdges: [importEdge("bindings", "cli")],
    });

    expect(edges).toEqual([]);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.message).toContain("already derived from imports");
    expect(diagnostics[0]?.message).toContain("remove the declaration");
  });

  it("errors when the same pair is declared twice", () => {
    const { edges, diagnostics } = resolveDeclaredEdges({
      talksTo: [
        declaration(),
        declaration({ file: "py/src/other.py", protocol: "a socket" }),
      ],
      fileLayers: new Map([
        ["py/src/session.py", "bindings"],
        ["py/src/other.py", "bindings"],
      ]),
      layers,
      importEdges: [],
    });

    expect(edges).toHaveLength(1);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.file).toBe("py/src/other.py");
    expect(diagnostics[0]?.message).toContain(
      "already declared in py/src/session.py",
    );
  });

  it("skips a file no layer resolves for, which extract already reports", () => {
    const { edges, diagnostics } = resolveDeclaredEdges({
      talksTo: [declaration({ file: "py/src/orphan.py" })],
      fileLayers,
      layers,
      importEdges: [],
    });

    expect(edges).toEqual([]);
    expect(diagnostics).toEqual([]);
  });
});

/**
 * Python records go through the same aggregation as TypeScript ones, so one
 * end-to-end case pins the whole chain: parse, resolve across packages, map to
 * layers, drop the intra-layer imports, and mark the package crossing.
 */
describe("buildGraph with Python packages", () => {
  let root: string;

  const pythonPackage = (name: string, path: string): ArchitecturePackage => ({
    name,
    path,
    description: `${name} test package`,
    language: "python",
    sourceDirectory: "src",
  });

  const write = async (
    relativePath: string,
    contents: string,
  ): Promise<void> => {
    const absolute = join(root, relativePath);
    await mkdir(join(absolute, ".."), { recursive: true });
    await writeFile(absolute, contents, "utf8");
  };

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "arch-docs-graph-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("aggregates a cross-package Python import into an imports edge", async () => {
    await write(
      "libs/py/src/petrinaut/__init__.py",
      "from .session import Session\n",
    );
    await write("libs/py/src/petrinaut/session.py", "import json\n");
    await write("apps/opt/src/__init__.py", "");
    await write(
      "apps/opt/src/api.py",
      "from petrinaut import Session\nfrom src.utils import helper\n",
    );
    await write("apps/opt/src/utils.py", "def helper(): ...\n");

    const files: [string, string][] = [
      ["libs/py/src/petrinaut/__init__.py", "bindings"],
      ["libs/py/src/petrinaut/session.py", "bindings"],
      ["apps/opt/src/__init__.py", "optimizer"],
      ["apps/opt/src/api.py", "optimizer"],
      ["apps/opt/src/utils.py", "optimizer"],
    ];

    const { edges, diagnostics } = await buildGraph({
      repoRoot: root,
      packages: [
        pythonPackage("@test/py", "libs/py"),
        pythonPackage("@test/opt", "apps/opt"),
      ],
      tsconfigPath: "unused-without-typescript-packages.json",
      ignoredDirectories: [],
      ignoredFilePattern: /\.test\.py$/u,
      fileLayers: new Map(files),
      layers: [layer("bindings", "@test/py"), layer("optimizer", "@test/opt")],
      talksTo: [],
    });

    expect(diagnostics).toEqual([]);
    // The intra-layer imports (`.session`, `src.utils`) and the stdlib import
    // are all dropped; the cross-package one is the only edge left.
    expect(edges).toEqual([
      {
        from: "optimizer",
        to: "bindings",
        provenance: "imports",
        fileDependencies: 1,
        examples: [
          {
            from: "apps/opt/src/api.py",
            to: "libs/py/src/petrinaut/__init__.py",
          },
        ],
        crossesPackage: true,
      },
    ]);
  });
});
