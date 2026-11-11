import { expect, test } from "vitest";

import { selectionInstruction } from "./selection-instruction.ts";

test("names the selected elements, and is absent with nothing selected", () => {
  expect(selectionInstruction([])).toBeUndefined();
  const instruction = selectionInstruction([{ type: "place", id: "queue" }]);
  expect(instruction).toContain("query_basis");
  expect(instruction).toContain('[{"type":"place","id":"queue"}]');
});
