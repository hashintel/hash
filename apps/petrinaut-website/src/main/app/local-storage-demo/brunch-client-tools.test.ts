import { expect, test } from "vitest";

import { petrinautAiTools } from "@hashintel/petrinaut-core";

import {
  batchedConstructionClientToolNames,
  brunchPetrinautDynamicToolNames,
  canonicalParityClientToolNames,
  canonicalPetrinautClientToolNames,
} from "./brunch-client-tools";

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

test("routes every canonical tool statically while retaining custom server tools", () => {
  for (const toolName of canonicalPetrinautClientToolNames) {
    expect(canonicalParityClientToolNames.has(toolName)).toBe(true);
    expect(brunchPetrinautDynamicToolNames.has(toolName)).toBe(false);
  }
  for (const toolName of batchedConstructionClientToolNames) {
    expect(canonicalParityClientToolNames.has(toolName)).toBe(true);
  }
});
