import {
  accumulatorColorKey,
  generateIteratorColorKey,
  generateOneOfPayloadColorKey,
  generatePayloadColorKey,
  generatePayloadColorName,
  lifecycleColorKey,
  pendingColorKey,
  stepFailureColorKey,
} from "../../flow-net-keys.js";

import type { Color, ColorElementType } from "@hashintel/petrinaut-core";
import type { PayloadKind } from "@local/hash-isomorphic-utils/flows/types";

/*
 * Token colours for flow nets. Every token carries the run it belongs to and, inside a `forEach`, the path of the
 * item it is for, so that transitions can correlate tokens of one run and item. Payload tokens carry a reference
 * to their value rather than the value itself: the value lives in the run's payload storage.
 */

const element = (name: string, type: ColorElementType) => ({
  elementId: name,
  name,
  type,
});

const runElements = [
  element("run_id", "string"),
  /*
   * The item a token is for: empty outside any `forEach`, its index inside one (`"2"`), and the indices of the
   * enclosing items, outermost first, inside nested ones (`"2.0"`).
   */
  element("item_path", "string"),
];

const createColor = ({
  id,
  name,
  description,
  displayColor,
  elements,
}: Omit<Color, "iconSlug" | "elements"> & {
  elements: Color["elements"];
}): Color => ({
  id,
  name,
  description,
  iconSlug: "circle",
  displayColor,
  elements: [...runElements, ...elements],
});

/** The colour each payload kind's tokens are drawn in, grouped by what the kind holds. */
const payloadKindDisplayColors: Record<PayloadKind, string> = {
  Text: "#2563EB",
  FormattedText: "#1D4ED8",
  WebPage: "#0EA5E9",
  WebSearchResult: "#0284C7",
  VersionedUrl: "#6366F1",
  ActorType: "#8B5CF6",
  EntityId: "#059669",
  EntityQuery: "#047857",
  PersistedEntityMetadata: "#10B981",
  ProposedEntity: "#22C55E",
  ProposedEntityWithResolvedLinks: "#16A34A",
  PropertyObjectWithMetadata: "#15803D",
  PropertyPatch: "#0D9488",
  FailedEntityProposal: "#B91C1C",
  Boolean: "#F59E0B",
  Number: "#EA580C",
  Date: "#D97706",
  DateTime: "#B45309",
  Duration: "#C2410C",
  FilterCondition: "#DB2777",
  SortKey: "#BE185D",
  Aggregation: "#9D174D",
  GoogleAccountId: "#65A30D",
  GoogleSheet: "#4D7C0F",
};

/** The colour of tokens that may be of one of several kinds. */
const oneOfDisplayColor = "#64748B";

const payloadElements = (array: boolean) => [
  element("ref", "string"),
  element("present", "boolean"),
  /* Not `length`, which the kernel language reserves for arrays and strings. */
  ...(array ? [element("item_count", "integer")] : []),
];

/**
 * The colour of a token carrying a payload of one kind: a flow input, a step input or output, or a `forEach` item.
 */
export const createPayloadColor = (kind: PayloadKind, array: boolean): Color =>
  createColor({
    id: generatePayloadColorKey(kind, array),
    name: generatePayloadColorName([kind], array),
    description: `A reference to ${array ? "an array of" : "a"} ${kind} payload${array ? "s" : ""}. \`present\` is false when an optional value is missing.`,
    displayColor: payloadKindDisplayColors[kind],
    elements: payloadElements(array),
  });

const sortedKinds = (kinds: readonly PayloadKind[]) =>
  [...new Set(kinds)].sort();

/**
 * The colour of a token for an action input that accepts any of several kinds. `kind` is the kind of the payload the
 * token refers to.
 */
export const createOneOfPayloadColor = (
  kinds: readonly PayloadKind[],
  array: boolean,
): Color =>
  createColor({
    id: generateOneOfPayloadColorKey(kinds, array),
    name: generatePayloadColorName(kinds, array),
    description: `A reference to ${array ? "an array of payloads" : "a payload"} of one of these kinds: ${sortedKinds(kinds).join(", ")}. \`kind\` is the payload's kind, and \`present\` is false when an optional value is missing.`,
    displayColor: oneOfDisplayColor,
    elements: [element("kind", "string"), ...payloadElements(array)],
  });

export const pendingColor = createColor({
  id: pendingColorKey,
  name: "Pending",
  description:
    "A step that has yet to start in a run (or for an item). Starting the step consumes it, so each step starts once.",
  displayColor: "#9CA3AF",
  elements: [],
});

export const lifecycleColor = createColor({
  id: lifecycleColorKey,
  name: "ActionAttempt",
  description:
    "An action running for a run (or item), with its attempts so far.",
  displayColor: "#F59E0B",
  elements: [element("attempts", "integer")],
});

export const stepFailureColor = createColor({
  id: stepFailureColorKey,
  name: "StepFailure",
  description: "A step that gave up after exhausting its retries.",
  displayColor: "#DC2626",
  elements: [element("step_id", "string")],
});

/**
 * The colour of the token a `forEach` step iterates over an array of `kind` with: `next` is the index of the next
 * item to fan out, of `item_count`.
 */
export const createIteratorColor = (kind: PayloadKind): Color =>
  createColor({
    id: generateIteratorColorKey(kind),
    name: `Iterator<${kind}>`,
    description: `Iterates over an array of ${kind} payloads for a forEach step: \`next\` is the index of the next item to fan out, of \`item_count\`.`,
    displayColor: payloadKindDisplayColors[kind],
    elements: [
      element("ref", "string"),
      element("item_count", "integer"),
      element("next", "integer"),
    ],
  });

export const accumulatorColor = createColor({
  id: accumulatorColorKey,
  name: "Accumulator",
  description:
    "Counts the items of a forEach step that have finished: the step completes when `done` equals `expected`.",
  displayColor: "#7C3AED",
  elements: [element("expected", "integer"), element("done", "integer")],
});
