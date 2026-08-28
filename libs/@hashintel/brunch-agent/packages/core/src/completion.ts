/**
 * `evaluateCompletion(model, demands)` — the nineteen invariants of
 * `docs/specs/elicitation-completion.md`, as code.
 *
 * Pure over the register-2 model and the plugin's demand rows. It reads no
 * transcript, turn count, session state, delivery, or budget; the same
 * `(model, demands)` always yields the same report. The answer is a derived
 * boolean plus an evidence-bearing report, never a lifecycle status: nothing
 * here is persisted and a later capture can turn `complete` back to `false`.
 */

import { type EpistemicStatus } from "./capture-store";
import {
  type ElicitedModel,
  type ElicitedNode,
  type SlotState,
} from "./elicited-model";
import {
  type FloorRow,
  type MustKnowRow,
  type PluginFile,
  type PrecisionDemand,
  type PrecisionWord,
} from "./plugin-file";

import type { JsonValue } from "./json-value";

export const COMPLETION_DIAGNOSTICS = [
  "version-mismatch",
  "below-minimum-count",
  "unsupported-active-objective",
  "unaddressed",
  "no-selected-slot",
  "inadmissible-status",
  "unaccepted-absence",
  "below-required-precision",
  "open-conflict",
  "unresolved-divergence",
  "missing-evidence",
] as const;

export type CompletionDiagnostic = (typeof COMPLETION_DIAGNOSTICS)[number];

export interface CompletionFailure {
  readonly diagnostic: CompletionDiagnostic;
  readonly nodeId?: string;
  readonly kind?: string;
  readonly slot?: string;
  /** What the row demands, in the row's own words. */
  readonly requirement: string;
  /** What the model holds. */
  readonly actual: string;
  readonly message: string;
  /** Supporting captures reached through the slot's support links. */
  readonly captureIds: readonly string[];
}

export interface OutsideSliceNode {
  readonly nodeId: string;
  readonly kind: string;
  /** Open issues on nodes no active objective depends on: visible, not blocking. */
  readonly open: readonly CompletionFailure[];
}

export interface CompletionReport {
  readonly complete: boolean;
  readonly pluginVersion: string;
  readonly revision: string;
  readonly failures: readonly CompletionFailure[];
  /** Nodes some active objective depends on (objectives included). */
  readonly sliceNodeIds: readonly string[];
  readonly outsideSlice: readonly OutsideSliceNode[];
}

/**
 * Which kind anchors question-relative demand and which of its slots names the
 * dependency slice. Derived from the file by convention: the kind named
 * `objective` and its single `at least N` row. Absent both, every node is demanded.
 */
export interface CompletionAnchor {
  readonly kind: string;
  readonly dependencySlot: string;
  readonly atLeast: number;
}

export interface CompletionDemands {
  readonly pluginVersion: string;
  readonly floor: readonly FloorRow[];
  readonly rows: readonly MustKnowRow[];
  /** Statuses a value may carry and count. Confirmation of an inference is itself an explicit capture. */
  readonly acceptedStatuses: readonly EpistemicStatus[];
  readonly anchor?: CompletionAnchor;
}

export const ANCHOR_KIND = "objective";

/** The demands one plugin file states, with the SDCPN default for accepted statuses. */
export const completionDemands = (
  file: PluginFile,
  options: { readonly acceptedStatuses?: readonly EpistemicStatus[] } = {},
): CompletionDemands => {
  const anchorRow = file.mustKnow.find(
    (row) => row.kind === ANCHOR_KIND && row.precision.kind === "at-least",
  );
  return {
    pluginVersion: file.version,
    floor: file.floor,
    rows: file.mustKnow,
    acceptedStatuses: options.acceptedStatuses ?? ["explicit"],
    ...(anchorRow && anchorRow.precision.kind === "at-least"
      ? {
          anchor: {
            kind: anchorRow.kind,
            dependencySlot: anchorRow.slot,
            atLeast: anchorRow.precision.count,
          },
        }
      : {}),
  };
};

const LADDER: Readonly<Record<PrecisionWord, number | null>> = {
  named: 0,
  number: 1,
  range: 2,
  spread: 3,
  "spelled out": null,
};

/**
 * Whether a value at `given` precision meets `demanded`. Numeric words form a
 * ladder (`spread` ⊃ `range` ⊃ `number` ⊃ `named`); `spelled out` is a
 * structure, satisfied only by itself, and it counts as `named`.
 */
export const precisionSatisfies = (
  given: PrecisionWord,
  demanded: PrecisionWord,
): boolean => {
  if (demanded === "spelled out") return given === "spelled out";
  if (given === "spelled out") return demanded === "named";
  return LADDER[given]! >= LADDER[demanded]!;
};

const describeDemand = (precision: PrecisionDemand): string =>
  precision.kind === "word" ? precision.word : `at least ${precision.count}`;

const isEmptySelection = (value: JsonValue): boolean =>
  value === null ||
  value === "" ||
  (Array.isArray(value) && value.length === 0) ||
  (typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length === 0);

const describeSlot = (slot: SlotState | undefined): string => {
  if (slot === undefined) return "not mentioned";
  switch (slot.state) {
    case "value":
      return `${slot.precision} value under status ${slot.status}`;
    case "absence":
      return `absence: ${slot.absence}${slot.pointer ? ` (source: ${slot.pointer})` : ""}`;
    case "conflict":
      return `${slot.readings.length} competing active readings`;
    case "divergence":
      return "prescribed and practiced readings diverge";
  }
};

const ACCEPTED_ABSENCES = new Set(["not-applicable", "explicitly-absent"]);

const evaluateRow = (
  node: ElicitedNode,
  row: MustKnowRow,
  demands: CompletionDemands,
  model: ElicitedModel,
): CompletionFailure | null => {
  const slot = node.slots[row.slot];
  const base = {
    nodeId: node.id,
    kind: node.kind,
    slot: row.slot,
    requirement: describeDemand(row.precision),
    actual: describeSlot(slot),
    captureIds: slot?.captureIds ?? [],
  };
  const fail = (
    diagnostic: CompletionDiagnostic,
    message: string,
  ): CompletionFailure => ({ ...base, diagnostic, message });

  if (slot === undefined) {
    return fail(
      "unaddressed",
      `"${row.slot}" has not been addressed on ${node.id}.`,
    );
  }
  if (slot.state === "conflict") {
    return fail(
      "open-conflict",
      `"${row.slot}" on ${node.id} has competing active captures; an explicit, user-cited resolution must close it.`,
    );
  }
  if (slot.state === "divergence") {
    return fail(
      "unresolved-divergence",
      `"${row.slot}" on ${node.id} differs between the prescribed and the practiced reading; the expert must resolve which the model follows.`,
    );
  }
  if (!demands.acceptedStatuses.includes(slot.status)) {
    return fail(
      "inadmissible-status",
      `"${row.slot}" on ${node.id} is held under status ${slot.status}; accepted: ${demands.acceptedStatuses.join(", ")}.`,
    );
  }
  if (
    !slot.evidenced ||
    slot.captureIds.some((id) => !model.activeCaptureIds.has(id))
  ) {
    return fail(
      "missing-evidence",
      `"${row.slot}" on ${node.id} is not backed by active, traceable user evidence.`,
    );
  }
  if (slot.state === "absence") {
    if (!ACCEPTED_ABSENCES.has(slot.absence)) {
      return fail(
        "unaddressed",
        `"${row.slot}" on ${node.id} is open: the expert answered "${slot.absence}"${slot.pointer ? `, pointing at ${slot.pointer}` : ""}; that is not a value.`,
      );
    }
    if (!row.notApplicableAllowed) {
      return fail(
        "unaccepted-absence",
        `"${row.slot}" on ${node.id} was declared ${slot.absence}, but this row does not allow an absence.`,
      );
    }
    return null;
  }
  if (isEmptySelection(slot.value)) {
    return fail(
      "no-selected-slot",
      `"${row.slot}" on ${node.id} selects nothing; a demand never passes through an empty selection.`,
    );
  }
  if (row.precision.kind === "at-least") {
    const count = Array.isArray(slot.value) ? slot.value.length : 1;
    return count >= row.precision.count
      ? null
      : fail(
          "below-minimum-count",
          `"${row.slot}" on ${node.id} lists ${count}; at least ${row.precision.count} needed.`,
        );
  }
  if (!precisionSatisfies(slot.precision, row.precision.word)) {
    return fail(
      "below-required-precision",
      `"${row.slot}" on ${node.id} is known as a ${slot.precision}; the model needs ${row.precision.word}. Smallest delta: move it from ${slot.precision} to ${row.precision.word}.`,
    );
  }
  return null;
};

const dependencyIds = (slot: SlotState | undefined): readonly string[] =>
  slot?.state === "value" && Array.isArray(slot.value)
    ? slot.value.filter((entry): entry is string => typeof entry === "string")
    : [];

export function evaluateCompletion(
  model: ElicitedModel,
  demands: CompletionDemands,
): CompletionReport {
  const header = {
    pluginVersion: demands.pluginVersion,
    revision: model.revision,
  };
  if (model.pluginVersion !== demands.pluginVersion) {
    return {
      ...header,
      complete: false,
      failures: [
        {
          diagnostic: "version-mismatch",
          requirement: `rows of plugin version ${demands.pluginVersion}`,
          actual: `model folded under ${model.pluginVersion}`,
          message:
            "The model and the demand rows come from different plugin versions; refold and retry.",
          captureIds: [],
        },
      ],
      sliceNodeIds: [],
      outsideSlice: [],
    };
  }

  const failures: CompletionFailure[] = [];

  for (const floor of demands.floor) {
    const count = model.nodes.filter((node) => node.kind === floor.kind).length;
    if (count < floor.atLeast) {
      failures.push({
        diagnostic: "below-minimum-count",
        kind: floor.kind,
        requirement: `at least ${floor.atLeast} ${floor.kind}`,
        actual: `${count}`,
        message: `The model has ${count} ${floor.kind} node(s); the floor needs ${floor.atLeast}.`,
        captureIds: [],
      });
    }
  }

  const byId = new Map(model.nodes.map((node) => [node.id, node]));
  const slice = new Set<string>();
  const { anchor } = demands;
  if (anchor === undefined) {
    for (const node of model.nodes) slice.add(node.id);
  } else {
    for (const objective of model.nodes.filter(
      (node) => node.kind === anchor.kind,
    )) {
      slice.add(objective.id);
      const slot = objective.slots[anchor.dependencySlot];
      const wanted = dependencyIds(slot);
      const resolved = wanted.filter((id) => byId.has(id));
      const dangling = wanted.filter((id) => !byId.has(id));
      if (resolved.length < anchor.atLeast) {
        failures.push({
          diagnostic: "unsupported-active-objective",
          nodeId: objective.id,
          kind: objective.kind,
          slot: anchor.dependencySlot,
          requirement: `at least ${anchor.atLeast} node the objective depends on`,
          actual:
            slot === undefined
              ? "not mentioned"
              : `${resolved.length} resolved${dangling.length > 0 ? `, ${dangling.length} naming no node in the model (${dangling.join(", ")})` : ""}`,
          message: `${objective.id} depends on nothing the model contains; an objective that depends on nothing is unsupported.`,
          captureIds: slot?.captureIds ?? [],
        });
      }
      for (const id of resolved) slice.add(id);
    }
  }

  const rowsFor = (kind: string): MustKnowRow[] =>
    demands.rows.filter(
      (row) =>
        row.kind === kind &&
        !(
          anchor !== undefined &&
          kind === anchor.kind &&
          row.slot === anchor.dependencySlot
        ),
    );

  const outsideSlice: OutsideSliceNode[] = [];
  for (const node of model.nodes) {
    const rowFailures = rowsFor(node.kind)
      .map((row) => evaluateRow(node, row, demands, model))
      .filter((failure): failure is CompletionFailure => failure !== null);
    if (slice.has(node.id)) {
      failures.push(...rowFailures);
    } else {
      outsideSlice.push({
        nodeId: node.id,
        kind: node.kind,
        open: rowFailures,
      });
    }
  }

  return {
    ...header,
    complete: failures.length === 0,
    failures,
    sliceNodeIds: [...slice].sort(),
    outsideSlice,
  };
}
