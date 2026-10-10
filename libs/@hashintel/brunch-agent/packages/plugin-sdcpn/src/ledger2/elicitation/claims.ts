import { toJsonSchema } from "@valibot/to-json-schema";
import * as v from "valibot";

import { vOrigin, vStatus } from "../shared/epistemics";
import { vClaimReference, vEntityReference } from "../shared/references";

export const vClaim = v.pipe(
  v.strictObject({
    text: v.pipe(
      v.string(),
      v.minLength(1),
      v.description(
        "One assertion or unresolved question, in the USER's terms.",
      ),
    ),
    entities: v.pipe(
      v.array(vEntityReference),
      v.description(
        "References to the entities this claim is about: existing entity IDs or $index references to entity entries in this call.",
      ),
    ),
    origin: vOrigin,
    status: vStatus,
    supersedes: v.optional(
      v.pipe(
        v.array(vClaimReference),
        v.description(
          "References to earlier claims this entry replaces: existing claim IDs or $index references to earlier claim entries in this queue. Omit for an additional claim; earlier records remain in the Ledger.",
        ),
      ),
    ),
  }),
  v.description(
    "A statement about named entities, with its source and agreement status. The system supplies its new claim ID and conversation turn; do not submit them. Revisions are new claims that explicitly supersede earlier ones.",
  ),
);

export type Claim = v.InferOutput<typeof vClaim>;

export const ClaimSchema = toJsonSchema(vClaim, { errorMode: "ignore" });
