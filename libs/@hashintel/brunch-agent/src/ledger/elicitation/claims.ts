import * as v from "valibot";

import { epistemicFields, resolveStatus } from "../shared/epistemics";
import { vClaimReference, vEntityReference } from "../shared/references";

export const vClaim = v.pipe(
  v.strictObject({
    text: v.pipe(
      v.string(),
      v.minLength(1),
      v.description(
        "One fact or unresolved question as a short active statement, grammar optional, e.g. 'press 2 idles when hopper empty', whatever its origin. The system prompt's Claims section sets the form.",
      ),
    ),
    entities: v.pipe(
      v.array(vEntityReference),
      v.description(
        "References to the entities this claim is about: existing entity IDs or $index references to entity entries in this call. At least one, unless the claim is open or conflicted; the map shows any other claim only under its entities.",
      ),
    ),
    ...epistemicFields,
    supersedes: v.optional(
      v.pipe(
        v.array(vClaimReference),
        v.description(
          "References to earlier claims this entry replaces: existing claim IDs or $index references to earlier claim entries in this queue. Omit for an additional claim. A superseded claim stays in the Ledger's log and leaves the current map; under an entity, the map shows it struck through beneath the claim that replaces it.",
        ),
      ),
    ),
  }),
  resolveStatus(),
  v.description(
    "A statement about named entities, with its source and agreement status. The system supplies its new claim ID and conversation turn; do not submit them. Revisions are new claims that explicitly supersede earlier ones.",
  ),
);

export type Claim = v.InferOutput<typeof vClaim>;
