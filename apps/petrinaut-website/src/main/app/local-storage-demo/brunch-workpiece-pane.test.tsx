import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";

import { foldBrunchWorkpieceHistory } from "./brunch-workpiece-history";
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
        toolName: "query_workpiece",
        toolCallId: "why-call",
        state: "output-available",
        output,
      },
    ],
  },
];

test("renders only the readable Ledger document without developer metadata", () => {
  const html = renderToStaticMarkup(
    <BrunchWorkpiecePane
      messages={messages}
      binding={binding}
      liveHash={undefined}
    />,
  );
  expect(html).toContain("<h1>Actual tool workpiece</h1>");
  expect(html).not.toContain("position:fixed");
  expect(html).not.toContain("<details");
  expect(html).not.toContain("Revision 1");
  expect(html).not.toContain("SHA-256");
  expect(html).not.toContain("why-call");
});

test("continues to render retained brunch_why results", () => {
  const legacyMessages = [
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
  const html = renderToStaticMarkup(
    <BrunchWorkpiecePane
      messages={legacyMessages}
      binding={binding}
      liveHash={undefined}
    />,
  );
  expect(html).toContain("<h1>Actual tool workpiece</h1>");
  expect(html).not.toContain("why-call");
});

test("warns when the live document differs without exposing raw tool output", () => {
  const html = renderToStaticMarkup(
    <BrunchWorkpiecePane
      messages={messages}
      binding={binding}
      liveHash={"c".repeat(64)}
    />,
  );
  expect(html).toContain("Live document hash differs");
  expect(html).not.toContain("Temporal context is not support.");
});

const settlementMessage = (revisionId: string, markdown?: string) => ({
  role: "assistant",
  purpose: "assistant",
  parts: [
    {
      type: "dynamic-tool",
      toolName: "mutate_workpiece",
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
  expect(html).toContain("<h1>Settled account</h1>");
  expect(html).not.toContain("settled-call");
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
  expect(html).toContain("<h1>Later account</h1>");
  expect(html).toContain(
    "recorded explanation predates a newer Ledger revision",
  );
  expect(html).not.toContain("Temporal context is not support.");
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
  expect(html).toContain("<h1>Actual tool workpiece</h1>");
  expect(html).not.toContain("why-call");
  expect(html).not.toContain("<h1>Earlier account</h1>");
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
  expect(html).toContain("<h1>Earlier account</h1>");
  expect(html).toContain("A newer Ledger revision exists");
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
              toolName: "mutate_workpiece",
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
  expect(html).not.toContain("Current state has not been queried");
});

test("folds unique validated settlement identities without treating queries as activity", () => {
  const settlement = settlementMessage("settled-call", "# Settled account");
  const history = foldBrunchWorkpieceHistory(
    [settlement, settlement, ...messages],
    binding,
  );
  expect(history.activityIdentities).toEqual(["settled-call"]);
  expect(history.report?.source).toBe("query");
});

test("does not count incomplete settlement pointers as activity", () => {
  const history = foldBrunchWorkpieceHistory(
    [settlementMessage("pointer-only")],
    binding,
  );
  expect(history.activityIdentities).toEqual([]);
  expect(history.stateChangedSinceReport).toBe(true);
});
