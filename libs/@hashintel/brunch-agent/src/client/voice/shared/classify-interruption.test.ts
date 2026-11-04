import { expect, test } from "vitest";

import { classifyInterruption } from "./classify-interruption";

test("uses only the pinned prompt, not a later vocabulary draft", () => {
  const pinned = "Aster Birch Cedar Dahlia Elm Fir Ginkgo Hazel Iris Juniper";
  expect(classifyInterruption(pinned, [], pinned)).toBe("prompt-regurgitation");
  expect(
    classifyInterruption(pinned, [], "Different session prompt"),
  ).toBeNull();
  expect(classifyInterruption("RelayDesk", [], "RelayDesk")).toBeNull();
  expect(classifyInterruption("Please stop", ["Please stop"], pinned)).toBe(
    "self-echo",
  );
});
