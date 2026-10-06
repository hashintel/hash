import { toJsonSchema } from "@valibot/to-json-schema";
import * as v from "valibot";

import { vOrigin, vStatus } from "../shared/epistemics.ts";
import { vTurn } from "../shared/turn.ts";
import { vEntityId } from "./entities.ts";

export const vClaimId = v.pipe(
  v.string(),
  v.minLength(1),
  v.description("The unique ID of a claim, used to refer to or supersede it."),
);

export const vClaim = v.pipe(
  v.strictObject({
    id: vClaimId,
    turn: vTurn,
    text: v.pipe(
      v.string(),
      v.minLength(1),
      v.description(
        "One assertion or unresolved question, in the USER's terms.",
      ),
    ),
    entities: v.pipe(
      v.array(vEntityId),
      v.description(
        "IDs of the entities this claim is about, not their names.",
      ),
    ),
    origin: vOrigin,
    status: vStatus,
    supersedes: v.optional(
      v.pipe(
        v.array(vClaimId),
        v.description(
          "IDs of earlier claims this entry replaces. Omit for an additional claim; earlier entries remain in the ledger.",
        ),
      ),
    ),
  }),
  v.description(
    "A statement about named entities, with its source and agreement status. Revisions are new claims that explicitly supersede earlier ones.",
  ),
);

export type Claim = v.InferOutput<typeof vClaim>;

export const ClaimSchema = toJsonSchema(vClaim);
