import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createProgramHost, type ProgramHost } from "./program-host";
import { createProgramWalker } from "./walk-program";
import { createSyntacticWalker } from "./walk-syntactic";

import type { IndexedDocument } from "../../facts";

const repoRoot = fileURLToPath(new URL("./walk.fixture", import.meta.url));
const files = [
  "src/core/types.ts",
  "src/core/index.ts",
  "src/ui/view.ts",
  "src/ui/consumer.ts",
  "src/ui/shadow.ts",
];

const references = (document: IndexedDocument | undefined): string[] =>
  (document?.occurrences ?? [])
    .filter((occurrence) => !occurrence.definition)
    .map((occurrence) => occurrence.symbol)
    .sort();
const definitions = (document: IndexedDocument | undefined): string[] =>
  (document?.occurrences ?? [])
    .filter((occurrence) => occurrence.definition)
    .map((occurrence) => occurrence.symbol)
    .sort();

let host: ProgramHost;
let program: Map<string, IndexedDocument>;
let syntactic: Map<string, IndexedDocument>;

beforeAll(() => {
  host = createProgramHost({ repoRoot, paths: {}, files });
  const programWalker = createProgramWalker(host);
  program = new Map(files.map((file) => [file, programWalker.walk(file)]));
  const syntacticWalker = createSyntacticWalker(host);
  syntactic = new Map(
    syntacticWalker
      .documents(files)
      .map((document) => [document.file, document]),
  );
});

afterAll(() => {
  host.dispose();
});

describe.each([
  ["program", () => program],
  ["syntactic", () => syntactic],
])("%s analysis", (_name, documents) => {
  it("names imported symbols by their declaring file, through re-exports and aliases", () => {
    expect(references(documents().get("src/ui/view.ts"))).toEqual(
      expect.arrayContaining([
        "src/core/index.ts#",
        "src/core/index.ts#coreVersion",
        "src/core/types.ts#",
        "src/core/types.ts#Token",
        "src/core/types.ts#describe",
        "src/core/types.ts#hidden",
      ]),
    );
  });

  it("defines a file's own exports and the module itself", () => {
    expect(definitions(documents().get("src/ui/view.ts"))).toEqual(
      expect.arrayContaining([
        "src/ui/view.ts#",
        "src/ui/view.ts#label",
        "src/ui/view.ts#loadLater",
        "src/ui/view.ts#render",
      ]),
    );
    expect(definitions(documents().get("src/core/types.ts"))).toEqual(
      expect.arrayContaining([
        "src/core/types.ts#",
        "src/core/types.ts#Token",
        "src/core/types.ts#describe",
        "src/core/types.ts#hidden",
      ]),
    );
  });

  it("makes a barrel reference what it re-exports by name, not what it forwards with a star", () => {
    expect(references(documents().get("src/core/index.ts"))).toEqual([
      "src/core/types.ts#describe",
    ]);
  });
});

describe("the two analyses differ on inference", () => {
  it("program sees a property read off a type the file never imports", () => {
    expect(references(program.get("src/ui/consumer.ts"))).toContain(
      "src/core/types.ts#kind",
    );
    expect(references(syntactic.get("src/ui/view.ts"))).toEqual([
      "src/core/index.ts#",
      "src/core/index.ts#coreVersion",
      "src/core/types.ts#",
      "src/core/types.ts#Token",
      "src/core/types.ts#describe",
      "src/core/types.ts#hidden",
    ]);
    expect(references(syntactic.get("src/ui/consumer.ts"))).toEqual([
      "src/ui/view.ts#label",
      "src/ui/view.ts#render",
    ]);
  });

  it("program also records member names, which syntactic leaves out", () => {
    expect(definitions(program.get("src/ui/consumer.ts"))).toEqual([
      "src/ui/consumer.ts#",
      "src/ui/consumer.ts#id",
      "src/ui/consumer.ts#kind",
      "src/ui/consumer.ts#kindOf",
      "src/ui/consumer.ts#shown",
      "src/ui/consumer.ts#text",
    ]);
    expect(definitions(syntactic.get("src/ui/consumer.ts"))).toEqual([
      "src/ui/consumer.ts#",
      "src/ui/consumer.ts#kindOf",
      "src/ui/consumer.ts#shown",
    ]);
  });
});

describe("program analysis skips what cannot leave the file", () => {
  it("leaves out names bound below the module scope and labels", () => {
    const document = program.get("src/ui/shadow.ts");
    expect(definitions(document)).toEqual([
      "src/ui/shadow.ts#",
      "src/ui/shadow.ts#Holder",
      "src/ui/shadow.ts#id",
      "src/ui/shadow.ts#kind",
      "src/ui/shadow.ts#shadowed",
      "src/ui/shadow.ts#token",
      "src/ui/shadow.ts#unshadowed",
    ]);
    expect(references(document)).not.toContain("src/ui/shadow.ts#outer");
  });

  it("still asks about the imports a local name shadows, and about members", () => {
    expect(references(program.get("src/ui/shadow.ts"))).toEqual([
      "src/core/types.ts#Token",
      "src/core/types.ts#kind",
      "src/ui/view.ts#label",
      "src/ui/view.ts#render",
    ]);
  });
});
