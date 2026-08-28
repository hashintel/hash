/**
 * Fixtures for the read path: a small synthetic plugin file and a capture
 * envelope builder. The synthetic file keeps the tests independent of the
 * SDCPN file's row set; `plugin-file.test.ts` reads the real file separately.
 */

import {
  captureDedupKey,
  type CaptureEnvelope,
  type CaptureIssue,
  type CaptureStoreEvent,
  type CaptureStoreSnapshot,
} from "../src/capture-store";
import { parsePluginFile, type PluginFile } from "../src/plugin-file";

import type { JsonValue } from "../src/json-value";
import type { SlotAssertion } from "../src/slot-assertion";

export const FIXTURE_PLUGIN_MARKDOWN = `# Fixture plugin

Plugin: \`fixture\` · Target formalism: fixture · Version: \`fixture/2026-08-25.1\`

## Purpose

Interview someone about things and steps.

## Kinds

| #   | kind        | what it is | projects to |
| --- | ----------- | ---------- | ----------- |
| 1   | \`objective\` | A question | metrics     |
| 2   | \`thing\`     | A thing    | colours     |
| 3   | \`step\`      | A step     | transitions |

Attributes apply to every kind.

## Must know

A slot is satisfied only by what the expert said.

| kind        | slot                    | precision   | "not applicable" allowed | why the model needs it |
| ----------- | ----------------------- | ----------- | ------------------------ | ---------------------- |
| \`objective\` | the question            | spelled out | no                       | anchor                 |
| \`objective\` | the nodes it depends on | at least 1  | no                       | slice                  |
| \`thing\`     | distinctions            | spelled out | no                       | types                  |
| \`thing\`     | how many                | range       | yes                      | population             |
| \`step\`      | how long it takes       | spread      | no                       | duration               |
| \`step\`      | who performs it         | named       | yes                      | binding                |

Static floor — the model must contain at least one \`objective\`, at least two \`thing\` nodes, and
at least one \`step\`.

### Precision words

| word    | means            | IR grade |
| ------- | ---------------- | -------- |
| \`named\` | identified in words | verbal |

## Patterns

| id  | when                            | ask                 |
| --- | ------------------------------- | ------------------- |
| P01 | a \`step\` is an event            | ask how often       |
| P02 | more than one \`thing\` competes  | ask which wins      |
| P03 | the expert says they do not know | ask for a source    |

## Moves

Move one. Move two.

## Deliverable

The model and its loss report.
`;

export const fixturePluginFile = (): PluginFile =>
  parsePluginFile(FIXTURE_PLUGIN_MARKDOWN);

export interface CaptureOptions {
  readonly status?: "explicit" | "inferred" | "tentative";
  readonly excerpt?: string;
  readonly supersedes?: string;
  readonly entry?: number;
}

/** A user-evidenced capture envelope whose content is one slot assertion. */
export const assertionCapture = (
  id: string,
  assertion: SlotAssertion,
  options: CaptureOptions = {},
): CaptureEnvelope => {
  const entry = options.entry ?? 1;
  const fields = {
    confidence: "firm",
    content: { value: assertion as unknown as JsonValue },
    evidence: [
      {
        excerpt: options.excerpt ?? `quote for ${id}`,
        pointer: { sessionId: "session-1", entryStart: entry, entryEnd: entry },
        source: "user" as const,
      },
    ],
    epistemicStatus: options.status ?? ("explicit" as const),
    ...(options.supersedes === undefined
      ? {}
      : { supersedes: options.supersedes }),
  };
  return { ...fields, id, dedupKey: captureDedupKey(fields) };
};

export const value = (
  kind: string,
  node: string,
  slot: string,
  precision: SlotAssertion["precision"],
  content: JsonValue,
  extra: Partial<Pick<SlotAssertion, "sourceRegime" | "rationale">> = {},
): SlotAssertion => ({
  type: "slot-asserted",
  kind,
  node,
  slot,
  precision,
  ...extra,
  assertion: { value: content },
});

export const absence = (
  kind: string,
  node: string,
  slot: string,
  state: Extract<SlotAssertion["assertion"], { absence: unknown }>["absence"],
  pointer?: string,
): SlotAssertion => ({
  type: "slot-asserted",
  kind,
  node,
  slot,
  assertion: { absence: state, ...(pointer === undefined ? {} : { pointer }) },
});

export const snapshotOf = (
  captures: readonly CaptureEnvelope[],
  issues: readonly CaptureIssue[] = [],
  events: readonly CaptureStoreEvent[] = [],
): CaptureStoreSnapshot => ({ captures, issues, events });

/**
 * A model that satisfies every fixture row for one objective, two things, and
 * one step. Tests perturb one capture at a time from here.
 */
export const completeCaptures = (): CaptureEnvelope[] => [
  assertionCapture(
    "c-objective-question",
    value("objective", "throughput", "the question", "spelled out", {
      question: "How many widgets per day?",
    }),
  ),
  assertionCapture(
    "c-objective-deps",
    value("objective", "throughput", "the nodes it depends on", "named", [
      "thing:widget",
      "thing:press",
      "step:stamp",
    ]),
  ),
  assertionCapture(
    "c-widget-distinctions",
    value("thing", "widget", "distinctions", "spelled out", ["small", "large"]),
  ),
  assertionCapture(
    "c-widget-count",
    absence("thing", "widget", "how many", "not-applicable"),
  ),
  assertionCapture(
    "c-press-distinctions",
    value("thing", "press", "distinctions", "spelled out", ["one press type"]),
  ),
  assertionCapture(
    "c-press-count",
    value("thing", "press", "how many", "range", { low: 2, high: 3 }),
  ),
  assertionCapture(
    "c-stamp-duration",
    value("step", "stamp", "how long it takes", "spread", {
      typical: 3,
      worse1in10: 5,
      better1in10: 2,
      unit: "minutes",
    }),
  ),
  assertionCapture(
    "c-stamp-actor",
    value("step", "stamp", "who performs it", "named", "the press operator"),
  ),
];
