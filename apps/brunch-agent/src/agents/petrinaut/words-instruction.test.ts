import { expect, test } from "vitest";

import { wordsInstruction } from "./words-instruction";

test("restates preferred spellings as untrusted data, and nothing without them", () => {
  expect(wordsInstruction([])).toBeUndefined();
  const instruction = wordsInstruction(["RelayDesk", "SDCPN"]);
  expect(instruction).toContain("untrusted data");
  expect(instruction).toContain('["RelayDesk","SDCPN"]');
});
