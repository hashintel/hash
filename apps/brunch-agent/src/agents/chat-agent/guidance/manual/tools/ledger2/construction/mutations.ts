import { toJsonSchema } from "@valibot/to-json-schema";
import * as v from "valibot";

import { vClaimId } from "../elicitation/claims.ts";
import { vTurn } from "../shared/turn.ts";

export const vMutation = v.pipe(
  v.strictObject({
    revision: v.pipe(
      v.string(),
      v.minLength(1),
      v.description(
        "The net revision ID returned by the successful net change, not a Ledger revision counter. Use the observed revision ID; never invent it.",
      ),
    ),
    turn: vTurn,
    claims: v.pipe(
      v.array(vClaimId),
      v.minLength(1),
      v.description(
        "IDs of the claims this net change addresses, from this batch or earlier Ledger entries.",
      ),
    ),
  }),
  v.description(
    "Records a change to the net and the claims it addresses. This is a record of an accepted change, not an instruction to mutate the net or confirmation of its claims.",
  ),
);

export type Mutation = v.InferOutput<typeof vMutation>;

export const MutationSchema = toJsonSchema(vMutation);
