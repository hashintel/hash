import { expect, test } from "vitest";

import { noNetViewRefusalNaming } from "./no-net-view-refusal";

test("the no-net-view refusal is pinned", () => {
  expect(noNetViewRefusalNaming("readNet")).toMatchInlineSnapshot(
    `"Not started: no current view of the net is in your context, either because none was read or because it was compacted away. Read the net (readNet), then make the change."`,
  );
});
