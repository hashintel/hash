import * as v from "valibot";

import { toolName } from "./naming";

import type {
  CaptureInputProposal,
  CaptureStoreRefusal,
} from "./capture-store";
import type { Plugin } from "./plugin";
import type { SessionEntryKind } from "./session-log";

const nonEmptyString = v.pipe(v.string(), v.nonEmpty());

export interface SweepExtraction {
  readonly proposals: readonly CaptureInputProposal[];
}

export const createSweepExtractionResultSchema = (
  plugin: Plugin,
): v.GenericSchema<unknown, SweepExtraction> =>
  v.strictObject({
    proposals: v.array(plugin.proposalCatalog[0].schema),
  });

export interface SweepAffordance {
  readonly id: string;
  readonly markdown: string;
}

export interface SweepRefusalFact {
  readonly code: string;
  readonly message: string;
}

export interface SweepResultFact {
  readonly status: "no-settled-range" | "refused" | "applied";
  readonly refusal?: SweepRefusalFact;
}

/** Binding-classified history; no substrate message shape crosses this seam. */
export interface SweepSessionEntry {
  readonly id: string;
  readonly kind: SessionEntryKind;
  readonly text: string;
  readonly affordances?: readonly SweepAffordance[];
  readonly replyToAffordanceId?: string;
  readonly sweepResult?: SweepResultFact;
  readonly sweepRepairSignal?: true;
}

export interface SweepState {
  /** Latest true-user entry included in a successfully applied sweep. */
  readonly sweptThroughUserEntryId: string | null;
  /** Loop guard: latest true-user entry offered for settlement judgment. */
  readonly lastCheckedUserEntryId: string | null;
}

const sweepStateSchema = v.strictObject({
  sweptThroughUserEntryId: v.nullable(nonEmptyString),
  lastCheckedUserEntryId: v.nullable(nonEmptyString),
});

export const createInitialSweepState = (): SweepState => ({
  sweptThroughUserEntryId: null,
  lastCheckedUserEntryId: null,
});

export const parseSweepState = (input: unknown): SweepState =>
  v.parse(sweepStateSchema, input);

const isTrueUserEntry = (entry: SweepSessionEntry): boolean =>
  entry.kind === "user" || entry.kind === "user-affordance-payload";

/**
 * End at the latest true-user entry. Trailing assistant/tool material remains
 * eligible for a later range instead of being swept while it is still evolving.
 */
export const unsweptTail = (
  entries: readonly SweepSessionEntry[],
  state: SweepState,
): readonly SweepSessionEntry[] => {
  const parsedState = parseSweepState(state);
  let startIndex = 0;
  if (parsedState.sweptThroughUserEntryId !== null) {
    const highWaterIndex = entries.findIndex(
      (entry) => entry.id === parsedState.sweptThroughUserEntryId,
    );
    if (highWaterIndex < 0 || !isTrueUserEntry(entries[highWaterIndex]!)) {
      throw new TypeError(
        `The swept high-water entry ${parsedState.sweptThroughUserEntryId} is absent from durable history or is not a true-user entry.`,
      );
    }
    startIndex = highWaterIndex + 1;
  }

  const candidate = entries.slice(startIndex);
  let latestUserIndex = -1;
  for (let index = candidate.length - 1; index >= 0; index -= 1) {
    if (isTrueUserEntry(candidate[index]!)) {
      latestUserIndex = index;
      break;
    }
  }
  return latestUserIndex < 0 ? [] : candidate.slice(0, latestUserIndex + 1);
};

/**
 * A sweep may replay the whole settled prefix. Content identity makes this
 * safe and lets a later pass repair anything an earlier extraction omitted.
 */
export const sweepableRange = (
  entries: readonly SweepSessionEntry[],
): readonly SweepSessionEntry[] => {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    if (isTrueUserEntry(entries[index]!)) return entries.slice(0, index + 1);
  }
  return [];
};

export type SettlementTriggerDecision =
  | {
      readonly action: "skip";
      readonly reason:
        | "pending-affordance"
        | "no-unswept-user"
        | "already-checked";
    }
  | {
      readonly action: "nudge";
      readonly tail: readonly SweepSessionEntry[];
      readonly throughUserEntryId: string;
      readonly nextState: SweepState;
    };

export const decideSettlementTrigger = (input: {
  readonly entries: readonly SweepSessionEntry[];
  readonly state: SweepState;
  readonly pendingAffordance: boolean;
}): SettlementTriggerDecision => {
  if (input.pendingAffordance)
    return { action: "skip", reason: "pending-affordance" };

  const tail = unsweptTail(input.entries, input.state);
  const latestUser = tail.at(-1);
  if (!latestUser) return { action: "skip", reason: "no-unswept-user" };
  if (input.state.lastCheckedUserEntryId === latestUser.id) {
    return { action: "skip", reason: "already-checked" };
  }
  return {
    action: "nudge",
    tail,
    throughUserEntryId: latestUser.id,
    nextState: parseSweepState({
      ...input.state,
      lastCheckedUserEntryId: latestUser.id,
    }),
  };
};

export const advanceSweepHighWater = (
  state: SweepState,
  throughUserEntryId: string,
): SweepState =>
  parseSweepState({
    ...state,
    sweptThroughUserEntryId: throughUserEntryId,
    lastCheckedUserEntryId: throughUserEntryId,
  });

/**
 * Application refusal reopens judgment for the still-unswept range. The
 * successful high-water remains authoritative; only the once-per-frontier
 * loop guard rolls back. A model that stops on the repair continuation will
 * therefore receive one ordinary settlement check instead of stranding the
 * range behind `already-checked`.
 */
export const reopenSweepAfterRefusal = (state: SweepState): SweepState => {
  const parsedState = parseSweepState(state);
  return parseSweepState({
    ...parsedState,
    lastCheckedUserEntryId: parsedState.sweptThroughUserEntryId,
  });
};

const renderEntry = (entry: SweepSessionEntry): readonly string[] => {
  const rendered: string[] = [];
  for (const affordance of entry.affordances ?? []) {
    rendered.push(`[assistant ask] ${affordance.markdown}`);
  }
  if (entry.text.length > 0) {
    const label = isTrueUserEntry(entry) ? "user" : entry.kind;
    rendered.push(`[${label}] ${entry.text}`);
  }
  return rendered;
};

const renderTail = (tail: readonly SweepSessionEntry[]): string =>
  tail.flatMap(renderEntry).join("\n");

export interface SettlementCheckSignal {
  readonly type: "settlement-check";
  readonly tagName: "settlement-check";
  readonly body: string;
}

export const buildSettlementCheckSignal = (
  tail: readonly SweepSessionEntry[],
): SettlementCheckSignal => ({
  type: "settlement-check",
  tagName: "settlement-check",
  body: [
    "The harness computed this unswept conversation tail:",
    renderTail(tail),
    `Judge whether this range has settled. If it has, call ${toolName("sweep")}. Declining is legal; continue the interview when the topic is still open.`,
  ].join("\n\n"),
});

export const buildSweepExtractionPrompt = (
  plugin: {
    readonly targetDomain: string;
    readonly proposalNames: readonly string[];
  },
  tail: readonly SweepSessionEntry[],
): string =>
  [
    `Extract capture proposals for the ${plugin.targetDomain} target from this settled conversation range.`,
    `Use only the declared proposal schema: ${plugin.proposalNames.join(", ")}. Do not add parsed structure or undeclared proposal types.`,
    "Every user-grounded proposal must cite one or more exact verbatim quotes from the user lines below. Never supply entry ids, ranges, pointers, or evidence sources; the harness resolves those.",
    "The declared verbatim interior must preserve what was said without paraphrase or normalization. Return an empty proposal list when no honest capture is available.",
    renderTail(tail),
  ].join("\n\n");

export interface SweepRepairSignal {
  readonly type: "sweep-repair";
  readonly tagName: "sweep-repair";
  readonly body: string;
}

export const buildSweepRepairSignal = (
  refusal: Pick<CaptureStoreRefusal, "code" | "message"> | SweepRefusalFact,
): SweepRepairSignal => ({
  type: "sweep-repair",
  tagName: "sweep-repair",
  body: `The sweep was refused: ${refusal.message} Repair the proposal and call ${toolName("sweep")} again. Declining is legal.`,
});

export const pendingSweepRepair = (
  entries: readonly SweepSessionEntry[],
): SweepRefusalFact | null => {
  let pending: SweepRefusalFact | null = null;
  for (const entry of entries) {
    if (entry.sweepRepairSignal) pending = null;
    if (entry.sweepResult?.status === "refused" && entry.sweepResult.refusal) {
      pending = entry.sweepResult.refusal;
    } else if (entry.sweepResult && entry.sweepResult.status !== "refused") {
      pending = null;
    }
  }
  return pending;
};

export interface UnaccountedAskAdvisory {
  readonly type: "unaccounted-ask";
  readonly affordanceId: string;
  readonly question: string;
  readonly message: string;
}

export const computeUnaccountedAskAdvisories = (
  tail: readonly SweepSessionEntry[],
  capturedUserEntryIds: ReadonlySet<string>,
): readonly UnaccountedAskAdvisory[] => {
  const accountedAffordanceIds = new Set(
    tail.flatMap((entry) =>
      entry.replyToAffordanceId === undefined ||
      !capturedUserEntryIds.has(entry.id)
        ? []
        : [entry.replyToAffordanceId],
    ),
  );
  return tail.flatMap((entry) =>
    (entry.affordances ?? [])
      .filter((affordance) => !accountedAffordanceIds.has(affordance.id))
      .map((affordance) => ({
        type: "unaccounted-ask" as const,
        affordanceId: affordance.id,
        question: affordance.markdown,
        message:
          "The swept range contains an ask with no affordance-bound capture.",
      })),
  );
};

export const settlementProtocolInstructionFragments = (): readonly string[] => [
  "When the harness reports an unswept tail, judge whether that range has settled. Declining is legal.",
  `When it has settled, call ${toolName("sweep")}. The harness privately extracts quote-anchored proposals, refreshes durable history, applies them atomically, and advances the swept high-water mark only on success.`,
  "Projection and validation are read-time operations; do not treat sweep completion as a stored derived result.",
];
