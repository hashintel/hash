import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

import { expect, test } from "vitest";

import {
  parseConstructionWhyInput,
  type ConstructionTransitionRecord,
} from "@hashintel/brunch-agent-plugin-sdcpn";
import { clientToolHistoryFrom } from "@hashintel/brunch-agent-transport-aisdk";

import { retainedSettledRevision } from "../src/conversation/root-arc.ts";
import {
  explainRootArc,
  type RootArcExplanation,
} from "../src/conversation/why.ts";

import type { FlueConversationSnapshot } from "@flue/sdk";

// Untouched actual browser capture; never imported into a product store.
const snapshot = JSON.parse(
  gunzipSync(
    readFileSync(
      new URL(
        "./fixtures/aggregate-why/typed-state/history.json.gz",
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

test("existing transition arc aggregates cannot inherit their empty creation basis", async () => {
  const directory = new URL(
    "./fixtures/aggregate-why/root-creation/",
    import.meta.url,
  );
  const rootSnapshot = JSON.parse(
    gunzipSync(readFileSync(new URL("history.json.gz", directory))).toString(
      "utf8",
    ),
  ) as FlueConversationSnapshot;
  const [prior] = JSON.parse(
    gunzipSync(readFileSync(new URL("why.json.gz", directory))).toString(
      "utf8",
    ),
  ) as RootArcExplanation[];
  if (!prior) throw new Error("Missing actual root explanation fixture");
  const explainField = (field: string) =>
    explainRootArc({
      snapshot: rootSnapshot,
      current: prior.currentWorkpiece,
      browser: { binding: prior.binding, construction: true },
      query: parseConstructionWhyInput({
        kind: "transition",
        name: "Test operation",
        field,
      }),
    });
  const aggregates = await Promise.all(
    ["inputArcs", "outputArcs"].map(explainField),
  );
  for (const answer of aggregates) {
    expect(answer.originToolCallId).toBe("creation-step");
    expect(answer.disposition).toBe("refused");
    expect(answer.reason).toMatch(/aggregate.*descendant/iu);
    expect(answer.governing).toBeUndefined();
    expect(answer.recordedChange).toBeUndefined();
    expect(answer.target?.value).toHaveLength(1);
  }
  const scalar = await explainField("lambdaCode");
  expect(scalar.originToolCallId).toBe("creation-step");
  expect(scalar.disposition).toBe("partially-supported");
  expect(scalar.recordedChange?.toolCallId).toBe("creation-pause");
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
