import { toJsonSchema } from "@valibot/to-json-schema";
import * as v from "valibot";

import { vObligation } from "./construction/obligations";
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
    v.strictTuple([v.literal("obligation/create"), vObligation]),
  ]),
  v.description(
    "Exactly two members: [route, payload]. The route names the record type, the operation and, for updates, the target address. Do not add an ID, index or turn member.",
  ),
);

export type LedgerEntry = v.InferOutput<typeof vLedgerEntry>;

type RecordType = "entity" | "claim" | "obligation";

const article: Record<RecordType, string> = {
  entity: "an entity",
  claim: "a claim",
  obligation: "an obligation",
};

/** The first misdirected `$index` reference, described so the model can correct it. */
const localReferenceProblem = (entries: LedgerEntry[]): string | undefined => {
  const problem = (
    reference: string,
    recordType: RecordType,
    at: string,
    before?: number,
  ) => {
    if (!reference.startsWith("$")) return undefined;
    const index = Number(reference.slice(1));
    const target = entries[index]?.[0];
    const expected =
      before !== undefined ? "an earlier claim" : article[recordType];
    if (target === undefined)
      return `${at} references ${reference}, but the queue has ${entries.length} entries ($0 to $${entries.length - 1}); expected ${expected}.`;
    if (
      !target.startsWith(`${recordType}/`) ||
      (before !== undefined && index >= before)
    )
      return `${at} references ${reference}, which is entries[${index}] (${target}); expected ${expected}. $index counts every entry in this queue, whatever its route.`;
    return undefined;
  };

  for (const [index, [route, payload]] of entries.entries()) {
    const at = (field: string) => `entries[${index}] (${route}) ${field}`;
    const references: [string[] | undefined, RecordType, string][] =
      route === "claim/create"
        ? [
            [payload.entities, "entity", "entities"],
            [payload.supersedes, "claim", "supersedes"],
          ]
        : route === "reflection/create"
          ? [
              [payload.claims, "claim", "claims"],
              [payload.entities, "entity", "entities"],
              [payload.discharges, "obligation", "discharges"],
            ]
          : route === "obligation/create"
            ? [
                [payload.claims, "claim", "claims"],
                [payload.entities, "entity", "entities"],
              ]
            : [];
    for (const [list, recordType, field] of references)
      for (const reference of list ?? []) {
        const found = problem(
          reference,
          recordType,
          at(field),
          field === "supersedes" ? index : undefined,
        );
        if (found !== undefined) return found;
      }
  }
  return undefined;
};

export const vLedgerAppend = v.pipe(
  v.strictObject({
    entries: v.pipe(
      v.array(vLedgerEntry),
      v.rawCheck(({ dataset, addIssue }) => {
        if (!dataset.typed) return;
        const message = localReferenceProblem(dataset.value);
        if (message !== undefined) addIssue({ message });
      }),
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
