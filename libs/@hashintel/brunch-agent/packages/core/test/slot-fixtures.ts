/**
 * Fixtures for the read path: a small synthetic plugin definition and a
 * capture envelope builder. The synthetic definition keeps the tests
 * independent of the SDCPN definition's row set; `plugin-definition.test.ts`
 * reads the real definitions separately.
 */

import {
  captureDedupKey,
  type CaptureEnvelope,
  type CaptureIssue,
  type CaptureStoreEvent,
  type CaptureStoreSnapshot,
} from "../src/capture-store";
import {
  readPluginDefinition,
  type PluginDefinition,
} from "../src/plugin-definition";

import type { JsonValue } from "../src/json-value";
import type { SlotAssertion } from "../src/slot-assertion";

export const FIXTURE_PLUGIN_YAML = `plugin:
  id: fixture
  version: fixture/2026-08-25.1
  formalism: fixture
  jobs: [construct]
  purpose: Interview someone about things and steps.

ontology:
  preamble: Attributes apply to every kind.
  kinds:
    - { kind: objective, is: A question, projects_to: metrics }
    - { kind: thing, is: A thing, projects_to: colours }
    - { kind: step, is: A step, projects_to: transitions }
  not_kinds:
    - { name: queue, text: "A queue is a thing with a count, not a kind." }
  attributes:
    - name: status
      on: every kind
      values: [current, planned]
      text: Whether the node exists today or is proposed.

schema:
  preamble: A slot is satisfied only by what the expert said.
  anchor: { kind: objective, depends_on: the nodes it depends on }
  floor:
    - { kind: objective, at_least: 1 }
    - { kind: thing, at_least: 2 }
    - { kind: step, at_least: 1 }
  must_know:
    - { kind: objective, slot: the question, precision: spelled out, not_applicable: false, why: anchor }
    - { kind: objective, slot: the nodes it depends on, precision: at least 1, not_applicable: false, why: slice }
    - { kind: thing, slot: distinctions, precision: spelled out, not_applicable: false, why: types }
    - { kind: thing, slot: how many, precision: range, not_applicable: true, why: population }
    - { kind: step, slot: how long it takes, precision: spread, not_applicable: false, why: duration }
    - { kind: step, slot: who performs it, precision: named, not_applicable: true, why: binding }
  proposals:
    - { type: slot-asserted, payload: slot-assertion }

patterns:
  preamble: Patterns fire on nodes.
  items:
    - { id: P01, on: [step], slot: how long it takes, when: a step is an event, ask: ask how often }
    - { id: P02, on: [thing], when: more than one thing competes, ask: ask which wins }
    - { id: P03, on: [], when: the expert says they do not know, ask: ask for a source }

guidance:
  lenses:
    - { name: fixture lens, text: Notice things. }
  techniques: []
  movements:
    slice: []
    sweep:
      - { name: fixture sweep, text: Sweep the things. }
  licenses: []
  motifs: []
  smells: []
  rabbit_holes: []
  failure_modes:
    - { name: fixture failure, text: It failed., signature: it says so }

runbooks:
  construct:
    kickoff:
      - { name: fixture kickoff, text: Ask the question first. }
    trajectory: []
    close: []

machinery:
  checks: [slot-assertion]
  tools: []
`;

export const fixturePluginDefinition = (): PluginDefinition =>
  readPluginDefinition(FIXTURE_PLUGIN_YAML);

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
