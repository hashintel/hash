import { describe, expect, test } from "vitest";

import { userGuidePageUrl } from "./user-guide-url";

describe("userGuidePageUrl", () => {
  test("links each page to where it is published", () => {
    expect(userGuidePageUrl("ai-assistant")).toMatch(
      /libs\/%40hashintel\/brunch-agent\/src\/ui\/chat\/docs\/ai-assistant\.md$/,
    );
    expect(userGuidePageUrl("scenarios")).toMatch(
      /libs\/%40hashintel\/petrinaut\/docs\/scenarios\.md$/,
    );
  });
});
