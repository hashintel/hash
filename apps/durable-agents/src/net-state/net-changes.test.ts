/**
 * Net-change attribution, ported from Brunch's
 * `apps/brunch-agent/src/shared/conversation/net-change-attribution.test.ts`:
 * the same calls as settled browser-call records in place of a Flue
 * snapshot's tool parts, each judged on the canonical calls it makes.
 */
import { expect, test } from "vitest";

import { toPetrinautId } from "@hashintel/petrinaut-core";

import { callsForElement, netCalls } from "./net-changes";

import type { BrowserCallRecord } from "../browser-call/browser-call";

/** An applied change, settled, issued at `callIndex` of one assistant entry. */
const applied = (
  callIndex: number,
  toolCallId: string,
  toolName: string,
  input: Record<string, unknown>,
): BrowserCallRecord => ({
  toolCallId,
  toolName,
  input: input as BrowserCallRecord["input"],
  status: "settled",
  issuedAt: 0,
  expiresAt: 0,
  task: 0,
  doorbell: null,
  capability: null,
  claimed: true,
  output: { applied: true },
  metadata: {
    documentRevision: { before: `${toolCallId}-0`, after: `${toolCallId}-1` },
  },
  issuedEntry: 1,
  callIndex,
});

const records = [
  applied(0, "arc-kind", "updateArcType", {
    transitionId: "serve",
    placeId: "queue",
    arcDirection: "input",
    type: "inhibitor",
  }),
  applied(1, "element", "addTypeElement", {
    typeId: "customer",
    element: { elementId: "age", name: "age", type: "real" },
  }),
  applied(2, "place", "petrinaut_create_place", {
    editor_id: "process-editor",
    id: "queue",
    name: "Queue",
    colorId: null,
    dynamicsEnabled: false,
    x: 0,
    y: 0,
  }),
  applied(3, "place-moved", "petrinaut_update_place", {
    editor_id: "process-editor",
    placeId: "queue",
    position: { x: 100, y: 200 },
  }),
  applied(4, "arc-moved", "petrinaut_update_arc", {
    editor_id: "process-editor",
    transitionId: "serve",
    arcDirection: "input",
    placeId: "queue",
    newPlaceId: "buffer",
    weight: 2,
  }),
];
const calls = netCalls(
  Object.fromEntries(records.map((record) => [record.toolCallId, record])),
);

const attributed = (
  kind: Parameters<typeof callsForElement>[1]["kind"],
  id: string,
) => callsForElement(calls, { kind, id }).map(({ toolCallId }) => toolCallId);

test("a change is attributed by the element kinds its canonical tool targets, not by its name", () => {
  // An arc's type is its arc kind, never a token type that shares the ID.
  expect(attributed("type", "inhibitor")).toEqual([]);
  // A type element belongs to its type.
  expect(attributed("type", "customer")).toEqual(["element"]);
});

test("a HASH Petrinaut tool's change is attributed by the element kinds its canonical operation targets", () => {
  expect(attributed("place", toPetrinautId("queue"))).toEqual(["place"]);
});

const arcAttributed = (placeId: string) =>
  callsForElement(calls, {
    kind: "arc",
    id: "arc",
    arc: {
      transitionId: toPetrinautId("serve"),
      arcDirection: "input",
      placeId: toPetrinautId(placeId),
    },
  }).map(({ toolCallId }) => toolCallId);

test("a merged arc update is attributed, through the canonical calls it makes, to the arc it retargeted and reweighted", () => {
  expect(arcAttributed("buffer")).toEqual(["arc-moved"]);
  // The arc it moved away from keeps only its own changes.
  expect(arcAttributed("queue")).toEqual(["arc-kind"]);
});

test("a change written with the model's own ids is attributed to the converted element the document holds", () => {
  expect(attributed("type", toPetrinautId("customer"))).toEqual(["element"]);
  // Only values under id keys convert, so the element type `real` names no type.
  expect(attributed("type", toPetrinautId("real"))).toEqual([]);
});
