/**
 * Register 2 — the elicited model, derived and never stored (ADR-0003).
 *
 * `foldElicitedModel` is a pure function of a capture-store snapshot and a
 * plugin file. It keeps only active captures, reads each one's slot assertion,
 * and groups them into nodes and slots. It is forbidden to interpret: a payload
 * it cannot read becomes an `unmapped` entry, two competing readings become a
 * `conflict`, a manual-versus-practice split becomes a `divergence`. Every slot
 * state answers "which captures made you" through its capture ids.
 */

import * as v from "valibot";

import {
  deriveCaptureStatus,
  deriveIssueStatus,
  type AbsenceState,
  type CaptureEnvelope,
  type CaptureStoreSnapshot,
  type EpistemicStatus,
} from "./capture-store";
import { type PluginDefinition, type PrecisionWord } from "./plugin-definition";
import {
  createSlotAssertionSchema,
  nodeId,
  type SlotAssertion,
  type SourceRegime,
} from "./slot-assertion";

import type { JsonValue } from "./json-value";

export interface SlotReading {
  readonly captureId: string;
  readonly status: EpistemicStatus;
  /** Whether user evidence spans back the capture (false for defaults and lookups). */
  readonly evidenced: boolean;
  readonly assertion: SlotAssertion;
}

export type SlotState =
  | {
      readonly state: "value";
      readonly value: JsonValue;
      readonly precision: PrecisionWord;
      readonly status: EpistemicStatus;
      readonly evidenced: boolean;
      readonly sourceRegime?: SourceRegime;
      readonly rationale?: string;
      readonly captureIds: readonly string[];
    }
  | {
      readonly state: "absence";
      readonly absence: AbsenceState;
      readonly pointer?: string;
      readonly status: EpistemicStatus;
      readonly evidenced: boolean;
      readonly captureIds: readonly string[];
    }
  | {
      readonly state: "conflict";
      readonly readings: readonly SlotReading[];
      readonly captureIds: readonly string[];
    }
  | {
      readonly state: "divergence";
      readonly prescribed: SlotReading;
      readonly practiced: SlotReading;
      readonly captureIds: readonly string[];
    };

export interface ElicitedNode {
  readonly id: string;
  readonly kind: string;
  readonly name: string;
  readonly slots: Readonly<Record<string, SlotState>>;
}

export interface UnmappedCapture {
  readonly captureId: string;
  readonly reason: string;
}

export interface ElicitedModel {
  readonly pluginVersion: string;
  /** Content digest of the active captures and open conflicts this model was folded from. */
  readonly revision: string;
  readonly nodes: readonly ElicitedNode[];
  readonly unmapped: readonly UnmappedCapture[];
  readonly activeCaptureIds: ReadonlySet<string>;
}

const canonical = (value: unknown): string =>
  JSON.stringify(value, (_key, inner: unknown) =>
    inner !== null && typeof inner === "object" && !Array.isArray(inner)
      ? Object.fromEntries(
          Object.entries(inner as Record<string, unknown>).sort(([a], [b]) =>
            a.localeCompare(b),
          ),
        )
      : inner,
  );

/** A stable, dependency-free digest; not cryptographic, only a revision label. */
const digest = (text: string): string => {
  const primeA = 1_000_000_007;
  const primeB = 998_244_353;
  let a = 17;
  let b = 31;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    a = (a * 131 + code) % primeA;
    b = (b * 137 + code) % primeB;
  }
  return `${a.toString(16).padStart(8, "0")}${b.toString(16).padStart(8, "0")}`;
};

const readingKey = (reading: SlotReading): string =>
  canonical({
    assertion: reading.assertion.assertion,
    precision: reading.assertion.precision ?? null,
    sourceRegime: reading.assertion.sourceRegime ?? null,
  });

const preferredStatus = (readings: readonly SlotReading[]): EpistemicStatus =>
  readings.find((reading) => reading.status === "explicit")?.status ??
  readings[0]!.status;

const settleSlot = (
  readings: readonly SlotReading[],
  conflictedCaptureIds: ReadonlySet<string>,
): SlotState => {
  const captureIds = readings.map((reading) => reading.captureId);
  if (readings.some((reading) => conflictedCaptureIds.has(reading.captureId))) {
    return { state: "conflict", readings, captureIds };
  }
  const distinct = new Map<string, SlotReading>();
  for (const reading of readings) {
    if (!distinct.has(readingKey(reading))) {
      distinct.set(readingKey(reading), reading);
    }
  }
  if (distinct.size > 1) {
    const prescribed = readings.filter(
      (reading) => reading.assertion.sourceRegime === "prescribed",
    );
    const practiced = readings.filter(
      (reading) => reading.assertion.sourceRegime === "practiced",
    );
    if (
      prescribed.length === 1 &&
      practiced.length === 1 &&
      readings.length === 2
    ) {
      return {
        state: "divergence",
        prescribed: prescribed[0]!,
        practiced: practiced[0]!,
        captureIds,
      };
    }
    return { state: "conflict", readings, captureIds };
  }
  const [first] = readings;
  const status = preferredStatus(readings);
  const evidenced = readings.some((reading) => reading.evidenced);
  const { assertion } = first!;
  if ("absence" in assertion.assertion) {
    return {
      state: "absence",
      absence: assertion.assertion.absence,
      ...(assertion.assertion.pointer === undefined
        ? {}
        : { pointer: assertion.assertion.pointer }),
      status,
      evidenced,
      captureIds,
    };
  }
  return {
    state: "value",
    value: assertion.assertion.value,
    // The schema requires a precision word on every value.
    precision: assertion.precision!,
    status,
    evidenced,
    ...(assertion.sourceRegime === undefined
      ? {}
      : { sourceRegime: assertion.sourceRegime }),
    ...(assertion.rationale === undefined
      ? {}
      : { rationale: assertion.rationale }),
    captureIds,
  };
};

const isEvidenced = (capture: CaptureEnvelope): boolean =>
  "evidence" in capture && capture.evidence.length > 0;

/** Fold the active captures of one snapshot into the model a plugin definition describes. */
export function foldElicitedModel(
  snapshot: CaptureStoreSnapshot,
  definition: PluginDefinition,
): ElicitedModel {
  const assertionSchema = createSlotAssertionSchema(definition);
  const active = snapshot.captures.filter(
    (capture) => deriveCaptureStatus(snapshot, capture.id) === "active",
  );
  const activeCaptureIds = new Set(active.map((capture) => capture.id));
  const openConflictIssues = snapshot.issues.filter(
    (issue) =>
      issue.type === "conflicting" &&
      deriveIssueStatus(snapshot, issue.id) === "open",
  );
  const conflictedCaptureIds = new Set(
    openConflictIssues.flatMap((issue) => issue.references),
  );

  const unmapped: UnmappedCapture[] = [];
  const readingsByNode = new Map<
    string,
    { kind: string; name: string; slots: Map<string, SlotReading[]> }
  >();

  for (const capture of active) {
    if ("absence" in capture.content) {
      unmapped.push({
        captureId: capture.id,
        reason:
          "An envelope-level absence carries no kind, node, or slot; record absences inside a slot assertion.",
      });
      continue;
    }
    const parsed = v.safeParse(assertionSchema, capture.content.value);
    if (!parsed.success) {
      unmapped.push({
        captureId: capture.id,
        reason: parsed.issues.map((issue) => issue.message).join(" "),
      });
      continue;
    }
    const { output: assertion } = parsed;
    const id = nodeId(assertion.kind, assertion.node);
    const node = readingsByNode.get(id) ?? {
      kind: assertion.kind,
      name: assertion.node,
      slots: new Map<string, SlotReading[]>(),
    };
    readingsByNode.set(id, node);
    const readings = node.slots.get(assertion.slot) ?? [];
    readings.push({
      captureId: capture.id,
      status: capture.epistemicStatus,
      evidenced: isEvidenced(capture),
      assertion,
    });
    node.slots.set(assertion.slot, readings);
  }

  const nodes: ElicitedNode[] = [...readingsByNode.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, node]) => ({
      id,
      kind: node.kind,
      name: node.name,
      slots: Object.fromEntries(
        [...node.slots.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([slot, readings]) => [
            slot,
            settleSlot(readings, conflictedCaptureIds),
          ]),
      ),
    }));

  const revision = digest(
    canonical({
      active: [...activeCaptureIds].sort(),
      conflicts: openConflictIssues.map((issue) => issue.id).sort(),
      plugin: definition.version,
    }),
  );

  return {
    pluginVersion: definition.version,
    revision,
    nodes,
    unmapped,
    activeCaptureIds,
  };
}

/** The node with this id, if the model has it. */
export const findNode = (
  model: ElicitedModel,
  id: string,
): ElicitedNode | undefined => model.nodes.find((node) => node.id === id);
