import { toJsonSchema } from "@valibot/to-json-schema";
import * as v from "valibot";

import { vClaimReference, vEntityReference } from "../shared/references";

export const vObligation = v.pipe(
  v.strictObject({
    text: v.pipe(
      v.string(),
      v.minLength(1),
      v.description(
        "The check owed, stated as the run, comparison or inspection that would meet it, e.g. 'a run at the current settings reproduces the March backlog', 'the best staffing level still holds when the placeholder service time varies from 5 to 15 minutes', 'the evening peak's arrivals reach the scenario'.",
      ),
    ),
    claims: v.optional(
      v.pipe(
        v.array(vClaimReference),
        v.description(
          "References to the claims the check tests or a result rests on: existing claim IDs or $index references to claim entries in this call.",
        ),
      ),
    ),
    entities: v.optional(
      v.pipe(
        v.array(vEntityReference),
        v.description(
          "References to the entities the check concerns, such as the case to reproduce: existing entity IDs or $index references to entity entries in this call.",
        ),
      ),
    ),
  }),
  v.check(
    (obligation) =>
      (obligation.claims?.length ?? 0) + (obligation.entities?.length ?? 0) > 0,
    "An obligation must reference at least one claim or entity.",
  ),
  v.description(
    "A check the model owes before a result that depends on it can be trusted. Create one for each case the purpose rests on (the model reproduces it), each stand-in a reported result rests on (the result survives varying it), and each confirmed claim the net or an experiment does not yet carry. Only a reflection discharges it, by citing the run or inspection that met it or the USER's explicit waiver; until then it stays owed.",
  ),
);

export type Obligation = v.InferOutput<typeof vObligation>;

export const ObligationSchema = toJsonSchema(vObligation, {
  errorMode: "ignore",
});
