import { expect, test } from "vitest";

import { toPetrinautId } from "@hashintel/petrinaut-core";

import {
  namesSelectionItem,
  netElementSelectionItem,
} from "./brunch-ledger-selection";

test("a written net element ID becomes the selection the document stores", () => {
  expect(netElementSelectionItem({ kind: "place", id: "queue" })).toEqual({
    type: "place",
    id: toPetrinautId("queue"),
  });
  const stored = toPetrinautId("queue");
  expect(netElementSelectionItem({ kind: "place", id: stored })).toEqual({
    type: "place",
    id: stored,
  });
});

test("a metric becomes a selection, as the editor can select one", () => {
  expect(netElementSelectionItem({ kind: "metric", id: "wait" })).toEqual({
    type: "metric",
    id: toPetrinautId("wait"),
  });
});

test("kinds the editor cannot select have no selection", () => {
  expect(netElementSelectionItem({ kind: "scenario", id: "peak" })).toBe(
    undefined,
  );
});

test("an address names a selected item of its kind by written or stored ID", () => {
  const item = { type: "place", id: toPetrinautId("queue") } as const;
  expect(namesSelectionItem({ kind: "place", id: "queue" }, item)).toBe(true);
  expect(namesSelectionItem({ kind: "transition", id: "queue" }, item)).toBe(
    false,
  );
  expect(namesSelectionItem({ kind: "place", id: "other" }, item)).toBe(false);
});
