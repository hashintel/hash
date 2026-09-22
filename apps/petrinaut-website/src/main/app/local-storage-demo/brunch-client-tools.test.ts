import { expect, test } from "vitest";

import { applyPetrinautConstructionToolName } from "@hashintel/brunch-agent-plugin-sdcpn";
import { petrinautAiTools } from "@hashintel/petrinaut-core";

import {
  canonicalPetrinautClientToolNames,
  deepPetrinautClientToolNames,
} from "./brunch-client-tools";

test("keeps literal parity with the stock Petrinaut tool catalogue", () => {
  expect([...canonicalPetrinautClientToolNames].toSorted()).toEqual(
    Object.keys(petrinautAiTools).toSorted(),
  );
});

test("adds only the deep Interface B tool to its separate catalogue", () => {
  expect([...deepPetrinautClientToolNames]).toEqual([
    ...canonicalPetrinautClientToolNames,
    applyPetrinautConstructionToolName,
  ]);
  expect(
    canonicalPetrinautClientToolNames.has(applyPetrinautConstructionToolName),
  ).toBe(false);
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
