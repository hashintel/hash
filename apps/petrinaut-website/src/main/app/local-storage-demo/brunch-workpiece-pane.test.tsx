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

test("renders a readable document without a floating overlay and keeps raw records in details", () => {
  const html = renderToStaticMarkup(
    <BrunchWorkpiecePane
      messages={messages}
      binding={binding}
      liveHash={undefined}
    />,
  );
  expect(html).toContain("<h1>Actual tool workpiece</h1>");
  expect(html).not.toContain("position:fixed");
  expect(html).toContain("<details");
  expect(html).not.toContain("<details open");
});

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

const settlementMessage = (revisionId: string, markdown?: string) => ({
  role: "assistant",
  purpose: "assistant",
  parts: [
    {
      type: "dynamic-tool",
      toolName: "update_workpiece",
      toolCallId: revisionId,
      state: "output-available",
      input: { markdown: "Unvalidated input must not be displayed" },
      output: {
        revisionId,
        sha256: "d".repeat(64),
        ordinal: 2,
        ...(markdown === undefined ? {} : { markdown }),
      },
    },
  ],
});

test("shows successful settlement output without requiring a model-chosen query", () => {
  const html = renderToStaticMarkup(
    <BrunchWorkpiecePane
      messages={[settlementMessage("settled-call", "# Settled account")]}
      binding={binding}
      liveHash={undefined}
    />,
  );
  expect(html).toContain("# Settled account");
  expect(html).toContain("Recorded settlement from settled-call");
  expect(html).toContain("not a current-authority query");
  expect(html).not.toContain("Unvalidated input must not be displayed");
});

test("a later settlement replaces the displayed query while retaining the recorded why", () => {
  const html = renderToStaticMarkup(
    <BrunchWorkpiecePane
      messages={[
        ...messages,
        settlementMessage("later-call", "# Later account"),
      ]}
      binding={binding}
      liveHash={undefined}
    />,
  );
  expect(html).toContain("# Later account");
  expect(html).toContain("Recorded settlement from later-call");
  expect(html).toContain("Temporal context is not support.");
  expect(html).toContain(
    "This why answer predates a later workpiece settlement",
  );
});

test("an explicit later query replaces a recorded settlement", () => {
  const html = renderToStaticMarkup(
    <BrunchWorkpiecePane
      messages={[
        settlementMessage("settled-call", "# Earlier account"),
        ...messages,
      ]}
      binding={binding}
      liveHash={undefined}
    />,
  );
  expect(html).toContain("# Actual tool workpiece");
  expect(html).toContain("State queried by why-call");
  expect(html).not.toContain("# Earlier account");
});

test("a later pointer-only legacy settlement marks the displayed account stale", () => {
  const html = renderToStaticMarkup(
    <BrunchWorkpiecePane
      messages={[
        settlementMessage("settled-call", "# Earlier account"),
        settlementMessage("legacy-call"),
      ]}
      binding={binding}
      liveHash={undefined}
    />,
  );
  expect(html).toContain("# Earlier account");
  expect(html).toContain("A later settlement exists");
  expect(html).not.toContain("Unvalidated input must not be displayed");
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
