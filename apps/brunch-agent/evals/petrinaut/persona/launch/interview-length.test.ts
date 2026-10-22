import { expect, test } from "vitest";

import { interviewLengthStorage } from "./interview-length.ts";

test("enables the website's interview length at the chosen level", () => {
  expect(interviewLengthStorage("quick")).toEqual({
    "petrinaut-website:interview-budget-enabled": "true",
    "petrinaut-website:interview-budget": "quick",
  });
});

test.each(["off", "Quick", ""])("rejects %j", (value) => {
  expect(() => interviewLengthStorage(value)).toThrow(
    "--interview-length must be one of quick|standard|thorough|deep",
  );
});
