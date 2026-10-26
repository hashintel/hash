import { expect, test } from "vitest";

import { petrinautAiTools } from "@hashintel/petrinaut-core/ai";

import { brunchTools } from "../constants";
import {
  browserToolMutatesDocument,
  petrinautToolEffects,
  petrinautToolTargets,
} from "./petrinaut-tool-effects";

test("classifies every canonical Petrinaut tool", () => {
  expect(Object.keys(petrinautToolEffects).toSorted()).toEqual(
    Object.keys(petrinautAiTools).toSorted(),
  );
});

test("only mutations, commands and unknown tools may change the bound document", () => {
  const unchanged = Object.keys(petrinautAiTools).filter(
    (toolName) => !browserToolMutatesDocument(toolName),
  );
  expect(unchanged.toSorted()).toEqual(
    [
      "createExperiment",
      "getLatestNetDefinition",
      "getNetCompilationErrors",
      "readPetrinautDoc",
    ].toSorted(),
  );
  expect(browserToolMutatesDocument("applyAutoLayout")).toBe(true);
  expect(browserToolMutatesDocument(brunchTools.draftPetrinautExperiment)).toBe(
    false,
  );
  expect(browserToolMutatesDocument("unmounted_tool")).toBe(true);
});

test("HASH's entity read reads the graph and never changes the bound document", () => {
  expect(browserToolMutatesDocument(brunchTools.queryHashEntities)).toBe(false);
  expect(petrinautToolTargets(brunchTools.queryHashEntities)).toEqual([]);
});
