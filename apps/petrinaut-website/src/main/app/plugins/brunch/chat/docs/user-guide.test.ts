import { describe, expect, test } from "vitest";

/**
 * @vitest-environment jsdom
 */
import { petrinautDocsContent } from "@hashintel/petrinaut/ui";

import { readUserGuidePage } from "./user-guide";

describe("Brunch's user guide", () => {
  test("reads Brunch's own assistant page instead of Petrinaut's", () => {
    const page = readUserGuidePage("ai-assistant");

    expect(page).toContain("This page describes Brunch's assistant");
    expect(page).not.toBe(petrinautDocsContent["ai-assistant"]);
  });

  test("reads every other page from Petrinaut", () => {
    expect(readUserGuidePage("scenarios")).toBe(petrinautDocsContent.scenarios);
  });
});
