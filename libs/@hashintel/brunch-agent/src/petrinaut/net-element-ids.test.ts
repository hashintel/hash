import { expect, test } from "vitest";

import { canonicalizeArcId, toPetrinautId } from "@hashintel/petrinaut-core";

import { namesId, storedNetElementId } from "./net-element-ids";

test("a written net element ID becomes the ID the document stores", () => {
  expect(storedNetElementId({ kind: "place", id: "queue" })).toBe(
    toPetrinautId("queue"),
  );
  const stored = toPetrinautId("queue");
  expect(storedNetElementId({ kind: "place", id: stored })).toBe(stored);
  expect(storedNetElementId({ kind: "arc", id: "a" })).toBe(
    canonicalizeArcId("a"),
  );
});

test("a written ID names its stored ID, and nothing else", () => {
  expect(namesId("queue", toPetrinautId("queue"))).toBe(true);
  expect(namesId("other", toPetrinautId("queue"))).toBe(false);
  expect(namesId(undefined, "queue")).toBe(false);
});
