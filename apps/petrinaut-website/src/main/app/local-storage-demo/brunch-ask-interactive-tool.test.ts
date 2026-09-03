import { describe, expect, test } from "vitest";

import { brunchAskFromComposerText } from "./brunch-ask-mapping";

describe("Brunch ask composer mapping", () => {
  test("maps finalized composer text to the pending ask answer", () => {
    expect(
      brunchAskFromComposerText({
        input: { question: "Who triages the incident?" },
        text: "The support lead.",
      }),
    ).toEqual({ answer: "The support lead." });
  });
});
