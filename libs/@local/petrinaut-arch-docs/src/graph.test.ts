import { describe, expect, it } from "vitest";

import { resolveDeclaredEdges } from "./graph";

import type { TalksToDeclaration } from "./extract";
import type { Edge, Layer } from "./model";

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
        declaredIn: "py/src/session.py",
        line: 3,
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

  it("errors when the target is the declaring file's own layer", () => {
    const { edges, diagnostics } = resolveDeclaredEdges({
      talksTo: [declaration({ target: "bindings" })],
      fileLayers,
      layers,
      importEdges: [],
    });

    expect(edges).toEqual([]);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.message).toContain("own layer");
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
