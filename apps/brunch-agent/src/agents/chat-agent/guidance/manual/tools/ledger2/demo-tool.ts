import { defineTool } from "@flue/runtime";
import * as v from "valibot";

import { vLedgerAppend } from "./append.ts";

export const appendToolName = "ledger_commit";

export const appendToolDescription =
  "Submit one ordered entries queue of exactly two-member [record type, payload] tuples. Record entities and claims from the USER's account with independent origin and status. New entries omit their IDs and turns; entity updates include an existing entity ID. Reference existing entities as e23, existing claims as c45, or entries in this queue as $index. Use $index only in reference fields, never to label an entry. Explain accepted net changes and interpret observed net elements in reflection text; anchor each reflection with at least one reference to an observed net element address, a claim or an entity, and note consequential approximations or omissions. Tool acceptance does not confirm any entry. This demo only validates and counts entries; it does not assign persistent IDs, store records or execute net changes.";

export const demoAppendTool = defineTool({
  name: appendToolName,
  description: appendToolDescription,
  input: vLedgerAppend,
  output: v.strictObject({
    claims: v.number(),
    entities: v.number(),
    reflections: v.number(),
  }),
  run({ data }) {
    const counts = { claims: 0, entities: 0, reflections: 0 };
    for (const [kind] of data.entries) {
      switch (kind) {
        case "elicitation.entity":
          counts.entities += 1;
          break;
        case "elicitation.claim":
          counts.claims += 1;
          break;
        case "construction.reflection":
          counts.reflections += 1;
          break;
      }
    }
    return {
      output: counts,
    };
  },
});
