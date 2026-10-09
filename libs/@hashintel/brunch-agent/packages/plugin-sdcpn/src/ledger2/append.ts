import { toJsonSchema } from "@valibot/to-json-schema";
import * as v from "valibot";

import { vReflection } from "./construction/reflections";
import { vClaim } from "./elicitation/claims";
import { vEntity } from "./elicitation/entities";
import { entityIdGrammar } from "./shared/references";

const vEntityUpdateRoute = v.pipe(
  v.string(),
  v.regex(new RegExp(`^entity/update/${entityIdGrammar}$`)),
  // The regex guarantees the template-literal shape; the cast restores it for discrimination.
  v.transform((route) => route as `entity/update/e${number}`),
  v.description(
    "entity/update/<existing entity ID>, such as entity/update/e45. The payload replaces every field of the addressed entity.",
  ),
);

export const vLedgerEntry = v.pipe(
  v.union([
    v.strictTuple([v.literal("entity/create"), vEntity]),
    v.strictTuple([vEntityUpdateRoute, vEntity]),
    v.strictTuple([v.literal("claim/create"), vClaim]),
    v.strictTuple([v.literal("reflection/create"), vReflection]),
  ]),
  v.description(
    "Exactly two members: [route, payload]. The route names the record type, the operation and, for updates, the target address. Do not add an ID, index or turn member.",
  ),
);

export type LedgerEntry = v.InferOutput<typeof vLedgerEntry>;

const validLocalReferences = (entries: LedgerEntry[]) => {
  const targets = (
    reference: string,
    recordType: "entity" | "claim",
    before?: number,
  ) => {
    if (!reference.startsWith("$")) return true;
    const index = Number(reference.slice(1));
    return (
      entries[index]?.[0].startsWith(`${recordType}/`) === true &&
      (before === undefined || index < before)
    );
  };

  return entries.every(([route, payload], index) => {
    if (route === "claim/create") {
      return (
        payload.entities.every((reference) => targets(reference, "entity")) &&
        (payload.supersedes ?? []).every((reference) =>
          targets(reference, "claim", index),
        )
      );
    }
    if (route === "reflection/create") {
      return (
        (payload.claims ?? []).every((reference) =>
          targets(reference, "claim"),
        ) &&
        (payload.entities ?? []).every((reference) =>
          targets(reference, "entity"),
        )
      );
    }
    return true;
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
        "An ordered queue of [route, payload] tuples. $index references the zero-based position in this entire queue, never a per-kind index. References may target any matching entry; supersedes must target an earlier claim. Empty queues are allowed.",
      ),
    ),
  }),
  v.description(
    "One append-only Ledger batch. The system supplies new record IDs, turns and change provenance. Address updates by their system-issued ID in the route; use existing IDs or $index references in relationship fields. Earlier records remain in the Ledger.",
  ),
);

export type LedgerAppend = v.InferOutput<typeof vLedgerAppend>;

export const LedgerAppendSchema = toJsonSchema(vLedgerAppend, {
  errorMode: "ignore",
});
