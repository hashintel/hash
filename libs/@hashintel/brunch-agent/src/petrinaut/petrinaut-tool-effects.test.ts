import { expect, test } from "vitest";

import { petrinautAiTools } from "@hashintel/petrinaut-core/ai";

import { petrinautToolEffects } from "./petrinaut-tool-effects";

test("classifies every canonical Petrinaut tool", () => {
  expect(Object.keys(petrinautToolEffects).toSorted()).toEqual(
    Object.keys(petrinautAiTools).toSorted(),
  );
});
