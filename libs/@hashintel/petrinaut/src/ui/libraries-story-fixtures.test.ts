import { describe, expect, it } from "vitest";

import {
  checkComposition,
  normalizeSDCPN,
  resolveLibrary,
  type ImportStates,
} from "@hashintel/petrinaut-core";

import {
  importingLineNet,
  logisticsLibrary,
  missingLibraryId,
  toolingLibrary,
} from "./libraries-story-fixtures";

describe("the story's libraries", () => {
  it("pass the checks a library gets when it arrives", () => {
    for (const library of [logisticsLibrary, toolingLibrary]) {
      expect(
        resolveLibrary(library.id, library).components.map(({ name }) => name),
      ).toEqual(library.components.map(({ name }) => name));
    }
  });

  it("leave the story's document with one error: the import that fails", () => {
    const imports: ImportStates = new Map([
      [
        logisticsLibrary.id,
        {
          status: "resolved",
          library: resolveLibrary(logisticsLibrary.id, logisticsLibrary),
        },
      ],
      [
        toolingLibrary.id,
        {
          status: "resolved",
          library: resolveLibrary(toolingLibrary.id, toolingLibrary),
        },
      ],
      [missingLibraryId, { status: "failed", message: "Not found." }],
    ]);

    const errors = checkComposition(
      normalizeSDCPN(importingLineNet),
      imports,
    ).filter(({ severity }) => severity === "error");

    expect(errors).toMatchObject([{ kind: "import" }]);
    expect(errors[0]?.message).toBe(
      "The import `@hashintel/missing`, which 1 instance uses, did not resolve. Not found.",
    );
  });
});
