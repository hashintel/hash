import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";

import { BrunchWorkpiecePane } from "./brunch-workpiece-pane";

const binding = {
  conversationId: "conversation",
  documentId: "document",
  incarnationId: "incarnation",
};
const output = {
  binding,
  currentWorkpiece: {
    revisionId: "revision",
    sha256: "a".repeat(64),
    markdown: "# Actual tool workpiece",
    ordinal: 1,
  },
  disposition: "partially-supported",
  reason: "Temporal context is not support.",
  reconciliation: { status: "as-of", sha256: "b".repeat(64) },
};
const messages = [
  {
    role: "assistant",
    purpose: "assistant",
    parts: [
      {
        type: "dynamic-tool",
        toolName: "brunch_why",
        toolCallId: "why-call",
        state: "output-available",
        output,
      },
    ],
  },
];

test("shows actual recorded tool output and refuses to call a hand-edited document reconciled", () => {
  const html = renderToStaticMarkup(
    <BrunchWorkpiecePane
      messages={messages}
      binding={binding}
      liveHash={"c".repeat(64)}
    />,
  );
  expect(html).toContain("# Actual tool workpiece");
  expect(html).toContain("Live document hash differs");
  expect(html).toContain("Temporal context is not support.");
});

test("does not reconstruct current state from historical revision input", () => {
  const html = renderToStaticMarkup(
    <BrunchWorkpiecePane
      messages={[
        {
          role: "assistant",
          purpose: "assistant",
          parts: [
            {
              type: "dynamic-tool",
              toolName: "update_workpiece",
              state: "output-available",
              input: { markdown: "History is not state" },
              output: { revisionId: "recovered" },
            },
          ],
        },
      ]}
      binding={binding}
      liveHash={"b".repeat(64)}
    />,
  );
  expect(html).not.toContain("History is not state");
  expect(html).toContain("Current state has not been queried");
});
