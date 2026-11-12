import { expect, test } from "vitest";

import { hashEvidencedDescription } from "./evidenced-description";

test("the HASH agent's `evidenced` description is pinned", () => {
  expect(hashEvidencedDescription).toMatchInlineSnapshot(
    `"It is in material the USER shared, such as a log or a document, or in records of the USER's own organisation that the agent read from HASH. What a tool computed, such as a run or an optimization, is not evidence for the account: record what it showed in a reflection."`,
  );
});
