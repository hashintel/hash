import { expect, test } from "vitest";

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
        applied("move", "commitNodePositions", {
          commits: [{ id: "queue", x: 10, y: 20 }],
        }),
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
  // Committing node positions changes the named place.
  expect(attributed("place", "queue")).toEqual(["move"]);
  // An arc's type is its arc kind, never a token type that shares the ID.
  expect(attributed("type", "inhibitor")).toEqual([]);
  // A type element belongs to its type.
  expect(attributed("type", "customer")).toEqual(["element"]);
});
