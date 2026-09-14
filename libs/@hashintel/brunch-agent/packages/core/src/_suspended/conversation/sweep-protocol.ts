import * as v from "valibot";

import { FreeTextAffordance } from "./affordance";

import type { SessionEntryKind } from "../../evidence/session-log";

/** The two affordance fields a sweep needs; extra affordance fields are ignored, not refused. */
export const SweepAffordanceSchema = v.pick(FreeTextAffordance, [
  "id",
  "markdown",
]);
export type SweepAffordance = v.InferOutput<typeof SweepAffordanceSchema>;

/** Read a sweep affordance off an untyped affordance payload or tool output. */
export const sweepAffordanceFrom = (
  value: unknown,
): SweepAffordance | undefined => {
  const parsed = v.safeParse(SweepAffordanceSchema, value);
  return parsed.success ? parsed.output : undefined;
};

export interface SweepRefusalFact {
  /** Durable history may contain refusal codes from a different harness version. */
  readonly code: string;
  readonly message: string;
}

export const SWEEP_RESULT_STATUSES = [
  "no-settled-range",
  "refused",
  "applied",
] as const;

export interface SweepResultFact {
  readonly status: (typeof SWEEP_RESULT_STATUSES)[number];
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

export const SWEEP_REPAIR_SIGNAL_TAG = "sweep-repair";
