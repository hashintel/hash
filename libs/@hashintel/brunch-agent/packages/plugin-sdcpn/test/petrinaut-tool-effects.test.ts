import { expect, test } from "vitest";

import { brunchTools } from "@hashintel/brunch-agent/constants";
import { petrinautAiTools } from "@hashintel/petrinaut-core/ai";

import {
  browserToolMutatesDocument,
  petrinautToolEffects,
} from "../src/petrinaut-tool-effects";

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
