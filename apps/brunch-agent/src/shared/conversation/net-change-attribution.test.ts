import { expect, test } from "vitest";

import { toPetrinautId } from "@hashintel/petrinaut-core";

import { callsForElement } from "./net-changes.ts";

import type { FlueConversationSnapshot } from "@flue/sdk";

const applied = (toolCallId: string, toolName: string, input: unknown) => ({
  type: "dynamic-tool",
  toolCallId,
  toolName,
  state: "output-available",
  input,
  output: {
    brunchBrowserResult: true,
    output: { applied: true },
    metadata: {
      documentRevision: { before: `${toolCallId}-0`, after: `${toolCallId}-1` },
    },
  },
});

const snapshot = {
  v: 1,
  conversationId: "conversation",
  offset: "1",
  settlements: [],
  messages: [
    {
      id: "assistant-1",
      role: "assistant",
      purpose: "assistant",
      display: "visible",
      parts: [
        applied("arc-kind", "updateArcType", {
          transitionId: "serve",
          placeId: "queue",
          arcDirection: "input",
          type: "inhibitor",
        }),
        applied("element", "addTypeElement", {
          typeId: "customer",
          element: { elementId: "age", name: "age", type: "real" },
        }),
        applied("place", "petrinaut_create_place", {
          editor_id: "process-editor",
          id: "queue",
          name: "Queue",
          colorId: null,
          dynamicsEnabled: false,
          differentialEquationId: null,
          x: 0,
          y: 0,
        }),
        applied("arc-moved", "petrinaut_update_arc", {
          editor_id: "process-editor",
          transitionId: "serve",
          arcDirection: "input",
          placeId: "queue",
          newPlaceId: "buffer",
          weight: 2,
        }),
      ],
    },
  ],
} as unknown as FlueConversationSnapshot;

const attributed = (
  kind: Parameters<typeof callsForElement>[1]["kind"],
  id: string,
) =>
  callsForElement(snapshot, { kind, id }).map(({ toolCallId }) => toolCallId);

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
  callsForElement(snapshot, {
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
