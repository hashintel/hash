import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

import { expect, test } from "vitest";

import {
  parseConstructionWhyInput,
  type ConstructionTransitionRecord,
} from "@hashintel/brunch-agent-plugin-sdcpn";
import { clientToolHistoryFrom } from "@hashintel/brunch-agent-transport-aisdk";

import { retainedSettledRevision } from "../src/conversation/root-arc.ts";
import { explainRootArc } from "../src/conversation/why.ts";

import type { FlueConversationSnapshot } from "@flue/sdk";

// Untouched actual browser capture; never imported into a product store.
const snapshot = JSON.parse(
  gunzipSync(
    readFileSync(
      new URL(
        "../../../libs/@hashintel/brunch-agent/docs/evidence/implementations/fe-1573-step-a/typed-state-checkpoint/browser-final/history.json.gz",
        import.meta.url,
      ),
    ),
  ).toString("utf8"),
) as FlueConversationSnapshot;
const current = retainedSettledRevision(snapshot, "typed-revision-two");
if (!current) throw new Error("Missing actual settled revision");
const first = clientToolHistoryFrom(snapshot.messages).results.find(
  (result) => result.toolCallId === "typed-type",
);
if (!first) throw new Error("Missing actual typed browser record");
const binding = (
  first.metadata as { transitionRecord: ConstructionTransitionRecord }
).transitionRecord.attempts[0]?.binding;
if (!binding) throw new Error("Missing actual document binding");
const browser = { binding, construction: true as const };
const explain = (query: unknown) =>
  explainRootArc({
    snapshot,
    current,
    browser,
    query: parseConstructionWhyInput(query),
  });

test.each([
  {
    kind: "scenario",
    name: "TestInitial",
    field: "initialState",
    origin: "typed-scenario",
  },
  {
    kind: "scenario",
    name: "TestInitial",
    field: "/initialState/content",
    origin: "typed-scenario",
  },
  {
    kind: "scenario",
    name: "TestInitial",
    field: "/initialState/content/test-queue/1",
    origin: "typed-scenario",
  },
  {
    kind: "type",
    name: "TestCorrectedAttributes",
    field: "elements",
    origin: "typed-type",
  },
  {
    kind: "type",
    name: "TestCorrectedAttributes",
    field: "entity",
    origin: "typed-type",
  },
])(
  "refuses current $kind $field aggregate without assigning creation or latest-child basis",
  async ({ origin, ...query }) => {
    const answer = await explain(query);
    expect(answer.disposition).toBe("refused");
    expect(answer.reason).toMatch(/aggregate.*descendant/iu);
    expect(answer.governing).toBeUndefined();
    expect(answer.recordedChange).toBeUndefined();
    expect(answer.originToolCallId).toBe(origin);
    expect(answer.appliedChanges?.length).toBeGreaterThan(1);
    expect(answer.reconciliation.status).toBe("as-of");
  },
);

test("keeps explicit and derived leaf causes separate beneath the refused row", async () => {
  const explicit = await explain({
    kind: "scenario",
    name: "TestInitial",
    field: "/initialState/content/test-queue/1/0",
  });
  expect(explicit.disposition).toBe("partially-supported");
  expect(explicit.target?.value).toBe(3);
  expect(explicit.recordedChange?.toolCallId).toBe("typed-explicit-initial");
  expect(explicit.governing?.revisionId).toBe("typed-revision-two");
  expect(explicit.originToolCallId).toBe("typed-scenario");
  const derived = await explain({
    kind: "scenario",
    name: "TestInitial",
    field: "/initialState/content/test-queue/1/1",
  });
  expect(derived.disposition).toBe("refused");
  expect(derived.reason).toMatch(/derived/);
  expect(derived.target?.value).toBe(false);
  expect(derived.recordedChange?.toolCallId).toBe("typed-active");
  expect(derived.governing).toBeUndefined();
  expect(derived.originToolCallId).toBe("typed-scenario");
  expect(derived.reconciliation).toEqual(explicit.reconciliation);
});

test("does not refuse an unchanged aggregate or primitive merely because sibling fields changed", async () => {
  for (const field of ["scenarioParameters", "name"]) {
    const answer = await explain({
      kind: "scenario",
      name: "TestInitial",
      field,
    });
    expect(answer.disposition).toBe("partially-supported");
    expect(answer.recordedChange?.toolCallId).toBe("typed-scenario");
    expect(answer.governing?.revisionId).toBe("typed-revision-one");
  }
});

test("preserves exact live observation reconciliation while refusing aggregate basis", async () => {
  const query = parseConstructionWhyInput({
    kind: "scenario",
    name: "TestInitial",
    field: "initialState",
    observationToolCallId: "typed-reopened-read",
  });
  const answer = await explainRootArc({
    snapshot,
    current,
    browser,
    query,
    activeObservationCallIds: ["typed-reopened-read"],
  });
  const leaf = await explainRootArc({
    snapshot,
    current,
    browser,
    query: parseConstructionWhyInput({
      ...query,
      field: "/initialState/content/test-queue/1/0",
    }),
    activeObservationCallIds: ["typed-reopened-read"],
  });
  expect(answer.disposition).toBe("refused");
  expect(answer.reconciliation).toEqual(leaf.reconciliation);
  expect(answer.reconciliation.status).toBe("serialization-equivalent");
  expect(answer.reconciliation.observationScope).toBe("live-observed");
  expect(answer.reconciliation.sha256).not.toBe(
    answer.reconciliation.recordedSha256,
  );
});
