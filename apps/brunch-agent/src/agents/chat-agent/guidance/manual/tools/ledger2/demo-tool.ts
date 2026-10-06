import { defineTool } from "@flue/runtime";
import * as v from "valibot";

import { vLedgerAppend } from "./append.ts";

export const appendToolName = "ledger_commit";

export const appendToolDescription =
  "Submit one ordered entries queue of exactly two-member [route, payload] tuples. Routes name the record type and operation: entity/create, entity/update/<entity ID> (such as entity/update/e45, replacing every field), claim/create and reflection/create. Record entities and claims from the USER's account with independent origin and status. Never submit IDs or turns inside payloads; the system assigns IDs to created records. Reference existing entities as e23, existing claims as c45, or entries in this queue as $index. Use $index only in reference fields, never in a route. Explain accepted net changes and interpret observed net elements in reflection text; anchor each reflection with at least one reference to an observed net element address, a claim or an entity, and note consequential approximations or omissions. Tool acceptance does not confirm any entry. This demo only validates and counts entries; it does not assign persistent IDs, store records or execute net changes.";

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
    for (const [route] of data.entries) {
      if (route.startsWith("entity/")) counts.entities += 1;
      else if (route === "claim/create") counts.claims += 1;
      else counts.reflections += 1;
    }
    return {
      output: counts,
    };
  },
});
