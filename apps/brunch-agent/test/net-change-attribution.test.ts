import { expect, test } from "vitest";

import { toPetrinautId } from "@hashintel/petrinaut-core";

import { callsForElement } from "../src/conversation/net-changes.ts";

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

test("a change written with the model's own ids is attributed to the converted element the document holds", () => {
  expect(attributed("type", toPetrinautId("customer"))).toEqual(["element"]);
  // Only values under id keys convert, so the element type `real` names no type.
  expect(attributed("type", toPetrinautId("real"))).toEqual([]);
});
