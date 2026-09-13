import * as v from "valibot";
import { describe, expect, test } from "vitest";

import { AskInput, AskSubmission } from "@hashintel/brunch-agent/client-tools";

describe("client tool schemas", () => {
  test("accept only non-empty ask questions and answers", () => {
    expect(
      v.safeParse(AskInput, { question: "What outcome matters?" }).success,
    ).toBe(true);
    expect(
      v.safeParse(AskSubmission, { answer: "A settled order." }).success,
    ).toBe(true);

    for (const value of [{}, null, "", { question: "" }, { answer: "" }]) {
      expect(v.safeParse(AskInput, value).success).toBe(false);
      expect(v.safeParse(AskSubmission, value).success).toBe(false);
    }
  });
});
