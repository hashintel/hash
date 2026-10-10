import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";

import { foldBrunchLedgerHistory } from "./brunch-ledger-history";
import { BrunchLedgerPane } from "./brunch-ledger-pane";

const change = {
  op: "add",
  address: "operational/resources",
  content: "Two people load each truck.",
  source: "person",
  standing: "settled",
};

const commit = (
  toolCallId: string,
  overrides: Record<string, unknown> = {},
) => ({
  type: "dynamic-tool",
  toolName: "ledger_commit",
  toolCallId,
  state: "output-available",
  input: { changes: [change] },
  output: {
    status: "recorded",
    commitId: toolCallId,
    revision: 1,
    notes: [{ address: "operational/resources/n1" }],
  },
  ...overrides,
});

const assistant = (...parts: unknown[]) => ({
  id: "assistant",
  role: "assistant",
  purpose: "assistant",
  parts,
});

test("renders the compiled Ledger from accepted commits", () => {
  const html = renderToStaticMarkup(
    <BrunchLedgerPane messages={[assistant(commit("c1"))]} />,
  );
  expect(html).toContain("Two people load each truck.");
  expect(html).toContain("operational/resources/n1");
  expect(html).toContain("person; settled");
});

test("never shows refused, failed, pending or unbound commits", () => {
  for (const part of [
    commit("refused", {
      output: {
        status: "refused",
        code: "unknown-category",
        message: "No category.",
        revision: 0,
      },
    }),
    commit("failed", { state: "output-error", output: undefined }),
    commit("pending", { state: "input-available", output: undefined }),
    commit("unbound", {
      output: {
        status: "recorded",
        commitId: "another-call",
        revision: 1,
        notes: [{ address: "operational/resources/n1" }],
      },
    }),
  ]) {
    const html = renderToStaticMarkup(
      <BrunchLedgerPane messages={[assistant(part)]} />,
    );
    expect(html).toContain("Nothing is recorded in the Ledger yet.");
    expect(html).not.toContain("Two people load each truck.");
  }
});

test("counts accepted commits and settled document changes as activity", () => {
  const settledChange = {
    type: "dynamic-tool",
    toolName: "addPlace",
    toolCallId: "canonical-call",
    state: "output-available",
    input: { id: "queue" },
    output: {
      brunchBrowserResult: true,
      output: { applied: true },
      metadata: { documentRevision: { before: "one", after: "two" } },
    },
  };
  const unchangedRead = {
    ...settledChange,
    toolName: "getLatestNetDefinition",
    toolCallId: "read-call",
    output: {
      brunchBrowserResult: true,
      output: {},
      metadata: { documentRevision: { before: "two" } },
    },
  };
  expect(
    foldBrunchLedgerHistory([
      assistant(commit("c1"), settledChange, unchangedRead),
    ]).activityIdentities,
  ).toEqual(["c1", "canonical-call"]);
});

const ledger2Commit = {
  type: "dynamic-tool",
  toolName: "ledger_commit",
  toolCallId: "m1",
  state: "output-available",
  input: {
    entries: [
      [
        "entity/create",
        {
          name: "Hillcrest service reservoir",
          kind: "resource",
          origin: "stated",
          status: "confirmed",
        },
      ],
    ],
  },
  output: { status: "recorded", commitId: "m1", revision: 1, ids: ["e1"] },
};

test("renders the manual arm's route-encoded Ledger in the user skin", () => {
  const messages = [assistant(ledger2Commit)];
  const html = renderToStaticMarkup(<BrunchLedgerPane messages={messages} />);
  expect(html).toContain("Hillcrest service reservoir");
  expect(html).not.toContain("e1");
  expect(foldBrunchLedgerHistory(messages).activityIdentities).toEqual(["m1"]);
  expect(
    foldBrunchLedgerHistory(messages, { skin: "agent" }).markdown,
  ).toContain("`e1`");
});
