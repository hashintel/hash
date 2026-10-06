import { toJsonSchema } from "@valibot/to-json-schema";
import * as v from "valibot";

import { vElement } from "./construction/elements.ts";
import { vMutation } from "./construction/mutations.ts";
import { vClaim } from "./elicitation/claims.ts";
import { vEntity } from "./elicitation/entities.ts";

export const vLedgerAppend = v.pipe(
  v.strictObject({
    elicitation: v.optional(
      v.pipe(
        v.strictObject({
          claims: v.optional(
            v.pipe(
              v.array(vClaim),
              v.description(
                "Claims made or revised in this exchange. Reference entity IDs and explicitly supersede prior claim IDs when replacing claims.",
              ),
            ),
          ),
          entities: v.optional(
            v.pipe(
              v.array(vEntity),
              v.description(
                "New entities or full updates to existing entities, each with origin and status. Give new entities new IDs; append full updates under their existing stable IDs.",
              ),
            ),
          ),
        }),
        v.description("Learning from the USER's account and shared material."),
      ),
    ),
    construction: v.optional(
      v.pipe(
        v.strictObject({
          mutations: v.optional(
            v.pipe(
              v.array(vMutation),
              v.description(
                "Observed net changes and the claim IDs each change addresses. Record only successful changes whose net revision IDs are available.",
              ),
            ),
          ),
          elements: v.optional(
            v.pipe(
              v.array(vElement),
              v.description(
                "Interpretations of observed net elements, with their addresses, agreement statuses, and entity and claim references.",
              ),
            ),
          ),
        }),
        v.description(
          "Records about construction already performed, not requests to change the net.",
        ),
      ),
    ),
  }),
  v.description(
    "One append-only Ledger batch containing any combination of elicitation and construction records. References may name entries from the same batch or earlier history. Omit unused groups or collections; empty collections are allowed. Earlier records remain in the Ledger.",
  ),
);

export type LedgerAppend = v.InferOutput<typeof vLedgerAppend>;

export const LedgerAppendSchema = toJsonSchema(vLedgerAppend);
