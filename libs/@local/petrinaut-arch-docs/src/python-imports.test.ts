import { describe, expect, it } from "vitest";

import {
  indexPythonModules,
  parsePythonImports,
  resolvePythonImport,
} from "./python-imports";

import type { ArchitecturePackage } from "./model";
import type { PythonImport } from "./python-imports";

/**
 * The parser is conservative: an import it misses loses one edge, an import it
 * invents puts a false claim in the docs. The non-matches are therefore pinned
 * as firmly as the matches: comments, docstring bodies and string literals
 * must contribute nothing.
 */

const pythonImport = (overrides: Partial<PythonImport>): PythonImport => ({
  kind: "from",
  module: "",
  level: 0,
  names: [],
  ...overrides,
});

describe("parsePythonImports", () => {
  it("parses absolute imports, including aliases and comma lists", () => {
    expect(parsePythonImports("import a.b\nimport os, c.d as x\n")).toEqual([
      pythonImport({ kind: "import", module: "a.b" }),
      pythonImport({ kind: "import", module: "os" }),
      pythonImport({ kind: "import", module: "c.d" }),
    ]);
  });

  it("parses from-imports with their bound names", () => {
    expect(parsePythonImports("from a.b import c, d as e\n")).toEqual([
      pythonImport({ module: "a.b", names: ["c", "d"] }),
    ]);
  });

  it("parses relative imports at each level", () => {
    expect(
      parsePythonImports(
        "from .x import y\nfrom ..pkg import z\nfrom . import session\n",
      ),
    ).toEqual([
      pythonImport({ module: "x", level: 1, names: ["y"] }),
      pythonImport({ module: "pkg", level: 2, names: ["z"] }),
      pythonImport({ module: "", level: 1, names: ["session"] }),
    ]);
  });

  it("keeps the base module when names are a star or spill onto later lines", () => {
    expect(
      parsePythonImports("from a import *\nfrom b.c import (\n    d,\n)\n"),
    ).toEqual([pythonImport({ module: "a" }), pythonImport({ module: "b.c" })]);
  });

  it("matches imports indented inside a function body", () => {
    expect(parsePythonImports("def main():\n    import uvicorn\n")).toEqual([
      pythonImport({ kind: "import", module: "uvicorn" }),
    ]);
  });

  it("ignores comments and string literals", () => {
    expect(
      parsePythonImports('# import os\nname = "import os"\nx = 1  # from a\n'),
    ).toEqual([]);
  });

  it("ignores import statements inside docstrings", () => {
    const source = [
      '"""Usage:',
      "import petrinaut",
      "from petrinaut import Session",
      '"""',
      "import real",
      '"""import inline"""',
      "'''",
      "from also import skipped",
      "'''",
    ].join("\n");

    expect(parsePythonImports(source)).toEqual([
      pythonImport({ kind: "import", module: "real" }),
    ]);
  });
});

const bindingsPackage: ArchitecturePackage = {
  name: "@test/bindings",
  path: "libs/py",
  description: "bindings",
  language: "python",
  sourceDirectory: "src",
};

const optimizerPackage: ArchitecturePackage = {
  name: "@test/optimizer",
  path: "apps/opt",
  description: "optimizer",
  language: "python",
  sourceDirectory: "src",
};

const files = [
  "libs/py/src/petrinaut/__init__.py",
  "libs/py/src/petrinaut/session.py",
  "libs/py/src/petrinaut/errors.py",
  "apps/opt/src/__init__.py",
  "apps/opt/src/utils.py",
  "apps/opt/src/api.py",
];

const index = indexPythonModules([bindingsPackage, optimizerPackage], files);

describe("indexPythonModules", () => {
  it("roots modules at the source root when it is not itself a package", () => {
    expect(index.moduleFiles.get("petrinaut")).toBe(
      "libs/py/src/petrinaut/__init__.py",
    );
    expect(index.moduleFiles.get("petrinaut.session")).toBe(
      "libs/py/src/petrinaut/session.py",
    );
  });

  it("roots modules at the package root when the source root has an __init__", () => {
    expect(index.moduleFiles.get("src")).toBe("apps/opt/src/__init__.py");
    expect(index.moduleFiles.get("src.utils")).toBe("apps/opt/src/utils.py");
  });
});

describe("resolvePythonImport", () => {
  it("resolves an absolute from-import of another covered package", () => {
    expect(
      resolvePythonImport(
        pythonImport({ module: "petrinaut", names: ["Session"] }),
        "apps/opt/src/api.py",
        index,
      ),
    ).toEqual(["libs/py/src/petrinaut/__init__.py"]);
  });

  it("resolves a bound name to its submodule when one exists", () => {
    expect(
      resolvePythonImport(
        pythonImport({ module: "petrinaut", names: ["session"] }),
        "apps/opt/src/api.py",
        index,
      ),
    ).toEqual(["libs/py/src/petrinaut/session.py"]);
  });

  it("resolves a plain dotted import", () => {
    expect(
      resolvePythonImport(
        pythonImport({ kind: "import", module: "src.utils" }),
        "apps/opt/src/api.py",
        index,
      ),
    ).toEqual(["apps/opt/src/utils.py"]);
  });

  it("resolves relative imports against the importer's package", () => {
    expect(
      resolvePythonImport(
        pythonImport({ module: "errors", level: 1, names: ["X"] }),
        "libs/py/src/petrinaut/session.py",
        index,
      ),
    ).toEqual(["libs/py/src/petrinaut/errors.py"]);

    expect(
      resolvePythonImport(
        pythonImport({ module: "", level: 1, names: ["session"] }),
        "libs/py/src/petrinaut/__init__.py",
        index,
      ),
    ).toEqual(["libs/py/src/petrinaut/session.py"]);
  });

  it("drops a relative import that climbs past the top-level package", () => {
    expect(
      resolvePythonImport(
        pythonImport({ module: "other", level: 2, names: ["x"] }),
        "libs/py/src/petrinaut/session.py",
        index,
      ),
    ).toEqual([]);
  });

  it("drops imports of modules nothing covered provides", () => {
    expect(
      resolvePythonImport(
        pythonImport({ kind: "import", module: "optuna" }),
        "apps/opt/src/api.py",
        index,
      ),
    ).toEqual([]);
  });
});
