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

/**
 * A successful settlement: pointer-only output bound to the call, body in the
 * canonical input. `boundRevisionId` lets a fixture leave the output unbound.
 */
const settlementMessage = (
  toolCallId: string,
  markdown: string,
  boundRevisionId: string = toolCallId,
) => ({
  role: "assistant",
  purpose: "assistant",
  parts: [
    {
      type: "dynamic-tool",
      toolName: "mutate_workpiece",
      toolCallId,
      state: "output-available",
      input: { markdown },
      output: {
        revisionId: boundRevisionId,
        sha256: "d".repeat(64),
        ordinal: 2,
        mutation: { baseRevisionId: null },
      },
    },
  ],
});

test("shows a successful settlement body from its bound input without a model-chosen query", () => {
  const html = renderToStaticMarkup(
    <BrunchWorkpiecePane
      messages={[settlementMessage("settled-call", "# Settled account")]}
      binding={binding}
      liveHash={undefined}
    />,
  );
  expect(html).toContain("<h1>Settled account</h1>");
  expect(html).not.toContain("settled-call");
});

test("does not display the input of a typed refused settlement or mark it newer", () => {
  const html = renderToStaticMarkup(
    <BrunchWorkpiecePane
      messages={[
        settlementMessage("settled-call", "# Settled account"),
        {
          role: "assistant",
          purpose: "assistant",
          parts: [
            {
              type: "dynamic-tool",
              toolName: "mutate_workpiece",
              toolCallId: "refused-call",
              state: "output-available",
              input: { markdown: "# Refused silent-shrink account" },
              output: {
                disposition: "refused",
                applied: false,
                correctable: true,
                code: "silent-shrink",
                message: "Nothing was written",
                currentRevision: {
                  revisionId: "settled-call",
                  sha256: "d".repeat(64),
                  ordinal: 2,
                },
              },
            },
          ],
        },
      ]}
      binding={binding}
      liveHash={undefined}
    />,
  );
  expect(html).toContain("<h1>Settled account</h1>");
  expect(html).not.toContain("Refused silent-shrink account");
  expect(html).not.toContain("A newer Ledger revision exists");
});

test("does not display the input of a failed settlement", () => {
  const html = renderToStaticMarkup(
    <BrunchWorkpiecePane
      messages={[
        settlementMessage("settled-call", "# Settled account"),
        {
          role: "assistant",
          purpose: "assistant",
          parts: [
            {
              type: "dynamic-tool",
              toolName: "mutate_workpiece",
              toolCallId: "refused-call",
              state: "output-error",
              input: { markdown: "# Refused stale-base account" },
              errorText: "baseRevisionId does not match",
            },
          ],
        },
      ]}
      binding={binding}
      liveHash={undefined}
    />,
  );
  expect(html).toContain("<h1>Settled account</h1>");
  expect(html).not.toContain("Refused stale-base account");
  expect(html).not.toContain("A newer Ledger revision exists");
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

test("a later settlement whose output is not bound to its call marks the displayed account stale", () => {
  const html = renderToStaticMarkup(
    <BrunchWorkpiecePane
      messages={[
        settlementMessage("settled-call", "# Earlier account"),
        settlementMessage("unbound-call", "# Unbound account", "other-call"),
      ]}
      binding={binding}
      liveHash={undefined}
    />,
  );
  expect(html).toContain("<h1>Earlier account</h1>");
  expect(html).toContain("A newer Ledger revision exists");
  expect(html).not.toContain("Unbound account");
});

test("does not reconstruct current state from an input its output does not bind", () => {
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

test("does not count unbound settlement pointers as activity", () => {
  const history = foldBrunchWorkpieceHistory(
    [settlementMessage("pointer-only", "# Unbound", "other-call")],
    binding,
  );
  expect(history.activityIdentities).toEqual([]);
  expect(history.stateChangedSinceReport).toBe(true);
});
