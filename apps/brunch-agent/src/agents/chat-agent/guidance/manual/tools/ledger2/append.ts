import { toJsonSchema } from "@valibot/to-json-schema";
import * as v from "valibot";

import { vReflection } from "./construction/reflections.ts";
import { vClaim } from "./elicitation/claims.ts";
import { vEntity } from "./elicitation/entities.ts";

export const vLedgerEntry = v.pipe(
  v.union([
    v.strictTuple([v.literal("elicitation.entity"), vEntity]),
    v.strictTuple([v.literal("elicitation.claim"), vClaim]),
    v.strictTuple([v.literal("construction.reflection"), vReflection]),
  ]),
  v.description(
    "Exactly two members: [record type, payload]. Do not add an ID, index or turn member. The type selects the payload schema.",
  ),
);

export type LedgerEntry = v.InferOutput<typeof vLedgerEntry>;

const validLocalReferences = (entries: LedgerEntry[]) => {
  const targets = (
    reference: string,
    kind: LedgerEntry[0],
    before?: number,
  ) => {
    if (!reference.startsWith("$")) return true;
    const index = Number(reference.slice(1));
    return (
      entries[index]?.[0] === kind && (before === undefined || index < before)
    );
  };

  return entries.every(([kind, payload], index) => {
    if (kind === "elicitation.entity") return true;
    if (kind === "elicitation.claim") {
      return (
        payload.entities.every((reference) =>
          targets(reference, "elicitation.entity"),
        ) &&
        (payload.supersedes ?? []).every((reference) =>
          targets(reference, "elicitation.claim", index),
        )
      );
    }
    return (
      (payload.claims ?? []).every((reference) =>
        targets(reference, "elicitation.claim"),
      ) &&
      (payload.entities ?? []).every((reference) =>
        targets(reference, "elicitation.entity"),
      )
    );
  });
};

export const vLedgerAppend = v.pipe(
  v.strictObject({
    entries: v.pipe(
      v.array(vLedgerEntry),
      v.check(
        validLocalReferences,
        "Local references must target an entry of the expected kind; supersedes must target an earlier claim.",
      ),
      v.description(
        "An ordered queue of [record type, payload] tuples. $index references the zero-based position in this entire queue, never a per-kind index. References may target any matching entry; supersedes must target an earlier claim. Empty queues are allowed.",
      ),
    ),
  }),
  v.description(
    "One append-only Ledger batch. The system supplies new record IDs, turns and change provenance. Use existing system-issued IDs or $index references in relationship fields. Earlier records remain in the Ledger.",
  ),
);

export type LedgerAppend = v.InferOutput<typeof vLedgerAppend>;

export const LedgerAppendSchema = toJsonSchema(vLedgerAppend, {
  errorMode: "ignore",
});
