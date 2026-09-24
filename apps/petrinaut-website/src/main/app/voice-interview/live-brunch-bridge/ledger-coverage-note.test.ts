import { expect, test } from "vitest";

import {
  describeLedgerCoverage,
  selectAppliedWorkpieceRevision,
} from "./ledger-coverage-note";

import type { FlueConversationState } from "@flue/sdk";

const workpiece = `# Process-Model Workpiece

## Purpose and posture

### What the model must answer, compare, or support

How many agents to schedule for the weekday peak.

### Who will use it and how

## Operational account

These are filing homes, not interview order.

### Participants, locations, flowing things, and resources

Agents (2 through 8), callers.

### Case and process spine: flow, branching, joining, failure, retry, and recovery

#### Primary case: a call

##### Ordered account and references

Arrive, wait first-come-first-served, handled by one agent, done.

### Time, quantities, arrivals, and stochastic behavior

About 50 calls per hour 10:00 to 12:00. Handling time six minutes with variation.

### Policies, exceptions, practiced rules, and contextual regimes

Hang-ups: **Not yet asked**.

### Validation evidence and data sources

## Cross-cutting issue ledger

- **Abandonment** — affects: Policies; unresolved: whether callers hang up; consequence: wait-time measure may be optimistic; re-enter when: person confirms.
- **Second wave** — affects: Time; unresolved: afternoon peak; consequence: none for first pass.

\`\`\`markdown
### Not a heading: inside a fence
\`\`\`
`;

test("describes settled, open and empty sections plus open issues, in a note under the append budget", () => {
  const note = describeLedgerCoverage({
    revisionId: "rev",
    ordinal: 3,
    markdown: workpiece,
  });
  expect(note).toContain("(revision 3)");
  expect(note).toContain(
    "Settled: What the model must answer, compare, or support; Participants, locations, flowing things, and resources; Case and process spine: flow, branching, joining, failure, retry, and recovery; Time, quantities, arrivals, and stochastic behavior.",
  );
  expect(note).toMatch(
    /marked open \(.*\): Policies, exceptions, practiced rules, and contextual regimes\./,
  );
  expect(note).toContain(
    "Not yet covered: Who will use it and how; Validation evidence and data sources.",
  );
  expect(note).toContain("Open cross-cutting issues: 2.");
  expect(note).not.toContain("inside a fence");
  expect(note.length).toBeLessThanOrEqual(1_400);
});

test("a nested case counts as content for its level-3 parent, and a section with only headings is empty", () => {
  const note = describeLedgerCoverage({
    revisionId: "rev",
    ordinal: undefined,
    markdown:
      "### Case and process spine\n\n#### Primary case\n\n##### Trigger\n\nA call arrives.\n\n### Time, quantities\n\n#### Sub\n\n##### Deeper\n",
  });
  expect(note).not.toContain("revision");
  expect(note).toContain("Settled: Case and process spine.");
  expect(note).toContain("Not yet covered: Time, quantities.");
});

test("drops the least useful sentences before truncating a long note", () => {
  const sections = Array.from(
    { length: 40 },
    (_, index) =>
      `### Section number ${index} with a long descriptive title\n\nSettled claim.\n`,
  ).join("\n");
  const emptySections = Array.from(
    { length: 40 },
    (_, index) => `### Empty section number ${index} with a long title\n`,
  ).join("\n");
  const note = describeLedgerCoverage({
    revisionId: "rev",
    ordinal: 1,
    markdown: `${sections}\n${emptySections}`,
  });
  expect(note).not.toContain("Not yet covered");
  expect(note.length).toBeLessThanOrEqual(1_400);
});

const revisionMessage = (
  toolCallId: string,
  output: Record<string, unknown>,
  input: unknown = { markdown: `### Goals\n\n${toolCallId}\n` },
  overrides: Partial<FlueConversationState["messages"][number]> = {},
): FlueConversationState["messages"][number] => ({
  id: `message-${toolCallId}`,
  role: "assistant",
  purpose: "assistant",
  display: "visible",
  parts: [
    {
      type: "dynamic-tool",
      toolName: "mutate_workpiece",
      toolCallId,
      state: "output-available",
      input,
      output,
    },
  ],
  ...overrides,
});

test("selects the latest revision whose output binds its own call and skips refused, unbound, foreign-role and non-workpiece parts", () => {
  const applied = revisionMessage("rev-1", {
    revisionId: "rev-1",
    sha256: "a",
    ordinal: 1,
  });
  const refused = revisionMessage("rev-2", {
    disposition: "refused",
    applied: false,
  });
  const unbound = revisionMessage("rev-3", {
    revisionId: "rev-1",
    sha256: "a",
    ordinal: 1,
  });
  const noMarkdown = revisionMessage(
    "rev-4",
    { revisionId: "rev-4", sha256: "d", ordinal: 4 },
    { body: "not markdown" },
  );
  const dispatch = revisionMessage(
    "rev-5",
    { revisionId: "rev-5", sha256: "e", ordinal: 5 },
    undefined,
    { role: "system", purpose: "dispatch" },
  );
  const otherTool: FlueConversationState["messages"][number] = {
    ...revisionMessage("rev-6", {
      revisionId: "rev-6",
      sha256: "f",
      ordinal: 6,
    }),
    parts: [
      {
        type: "dynamic-tool",
        toolName: "read_workpiece",
        toolCallId: "rev-6",
        state: "output-available",
        input: { markdown: "### Goals\n\nread\n" },
        output: { revisionId: "rev-6", sha256: "f", ordinal: 6 },
      },
    ],
  };
  expect(
    selectAppliedWorkpieceRevision([
      applied,
      refused,
      unbound,
      noMarkdown,
      dispatch,
      otherTool,
    ]),
  ).toEqual({
    revisionId: "rev-1",
    ordinal: 1,
    markdown: "### Goals\n\nrev-1\n",
  });
  expect(selectAppliedWorkpieceRevision([refused, unbound])).toBeNull();

  const later = revisionMessage("rev-7", {
    revisionId: "rev-7",
    sha256: "g",
    ordinal: 2,
  });
  expect(selectAppliedWorkpieceRevision([applied, later])?.revisionId).toBe(
    "rev-7",
  );
});
