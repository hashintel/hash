import { defineTool } from "@flue/runtime";
import * as v from "valibot";

import { vLedgerAppend } from "./append.ts";

export const appendToolName = "ledger_append";

export const appendToolDescription =
  "Submit one append-only Ledger batch. Under elicitation, record entities and claims from the USER's account with independent origin and status. Pencil in unagreed entries as tentative; entity updates reuse IDs, while revised claims get new IDs and supersede prior claims. Under construction, record observed net mutations with the claim IDs they address and interpretations of inspected net elements. Do not invent net revision IDs or element addresses. Include related records together and omit unused collections. This demo validates and counts entries without storing them or executing net changes.";

export const demoAppendTool = defineTool({
  name: appendToolName,
  description: appendToolDescription,
  input: vLedgerAppend,
  output: v.strictObject({
    claims: v.number(),
    entities: v.number(),
    mutations: v.number(),
    elements: v.number(),
  }),
  run({ data }) {
    return {
      output: {
        claims: data.elicitation?.claims?.length ?? 0,
        entities: data.elicitation?.entities?.length ?? 0,
        mutations: data.construction?.mutations?.length ?? 0,
        elements: data.construction?.elements?.length ?? 0,
      },
    };
  },
});
