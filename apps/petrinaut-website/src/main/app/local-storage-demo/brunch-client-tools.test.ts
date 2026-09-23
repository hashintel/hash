import { expect, test } from "vitest";

import { applyPetrinautConstructionToolName } from "@hashintel/brunch-agent-plugin-sdcpn";
import { petrinautAiTools } from "@hashintel/petrinaut-core";

import {
  canonicalPetrinautClientToolNames,
  deepPetrinautClientToolNames,
  integratedPetrinautClientToolNames,
} from "./brunch-client-tools";

test("keeps literal parity with the stock Petrinaut tool catalogue", () => {
  expect([...canonicalPetrinautClientToolNames].toSorted()).toEqual(
    Object.keys(petrinautAiTools).toSorted(),
  );
});

test("keeps canonical execution beside the distinct draft only in integrated modes", () => {
  const canonicalNames = Object.keys(petrinautAiTools);
  expect(canonicalNames).toContain("createExperiment");
  expect(canonicalNames).not.toContain("draft_petrinaut_experiment");
  expect(
    canonicalPetrinautClientToolNames.has("draft_petrinaut_experiment"),
  ).toBe(false);
  for (const names of [
    integratedPetrinautClientToolNames,
    deepPetrinautClientToolNames,
  ]) {
    expect(names.has("createExperiment")).toBe(true);
    expect(names.has("draft_petrinaut_experiment")).toBe(true);
  }
});

test("adds only the deep Interface B tool to its separate catalogue", () => {
  expect([...deepPetrinautClientToolNames]).toEqual([
    ...integratedPetrinautClientToolNames,
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
