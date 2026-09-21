import { expect, test } from "vitest";

import { petrinautAiTools } from "@hashintel/petrinaut-core";

import { canonicalPetrinautClientToolNames } from "./brunch-client-tools";

test("keeps literal parity with the stock Petrinaut tool catalogue", () => {
  expect([...canonicalPetrinautClientToolNames].toSorted()).toEqual(
    Object.keys(petrinautAiTools).toSorted(),
  );
});

test("includes the full stock capability surface required by the tracer", () => {
  for (const toolName of [
    "addPlace",
    "deleteItemsByIds",
    "getLatestNetDefinition",
    "getNetCompilationErrors",
    "setNetTitle",
    "readPetrinautDoc",
    "applyAutoLayout",
    "createExperiment",
  ]) {
    expect(canonicalPetrinautClientToolNames.has(toolName)).toBe(true);
  }
});
