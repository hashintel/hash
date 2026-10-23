/**
 * Brunch's `ledger_commit` as a Pi Durable tool, in its own extension. The
 * input schema and result contract are `@hashintel/brunch-agent`'s; only the
 * tool definition changes shape. Commits accumulate in the conversation's
 * `LedgerDoc`, which the tool reads and edits.
 */
import { Type } from "@earendil-works/pi-ai";
import { defineExtension, defineTool } from "@earendil-works/pi-durable";
import { toJsonSchema } from "@valibot/to-json-schema";
import * as v from "valibot";

import {
  brunchTools,
  type LedgerAppend,
  type LedgerAppendOutput,
  ledgerAppendOutputSchema,
  vLedgerAppend,
} from "@hashintel/brunch-agent";

import { appendToLedger } from "./ledger-doc/ledger-doc";

export { foldLedger, LedgerDoc } from "./ledger-doc/ledger-doc";

/** A Valibot schema as the JSON Schema Flue sends a model (`toolInputToJsonSchema`), typed for Pi. */
const typedJsonSchema = <T>(schema: v.GenericSchema) => {
  const { $schema: _schema, ...jsonSchema } = toJsonSchema(schema, {
    errorMode: "ignore",
  });
  return Type.Unsafe<T>(jsonSchema);
};

/** Copied from `apps/brunch-agent/src/agents/petrinaut/tools/ledger.ts`, which the lib does not export. */
const commitToolDescription =
  "Submit one ordered entries queue of exactly two-member [route, payload] tuples. Routes name the record type and operation: entity/create, entity/update/<entity ID> (such as entity/update/e45, replacing every field), claim/create, obligation/create and reflection/create. Record entities and claims from the USER's account with independent origin and status. Never submit IDs or turns inside payloads; the system assigns IDs to created records. Reference existing entities as e23, existing claims as c45, existing obligations as o7, or entries in this queue as $index. Use $index only in reference fields, never in a route. Explain accepted net changes and interpret observed net elements in reflection text; anchor each reflection with at least one reference to an observed net element address, a claim, an entity or an obligation it discharges. Record a check the model owes, such as reproducing a case or varying a stand-in a result rests on, as an obligation; discharge it only with a reflection that cites the run or inspection that met it. Tool acceptance does not confirm any entry. A recorded result returns the new revision, the system-assigned ID for each entry aligned with the submitted queue, how many USER messages have passed and how many questions are open, the obligations still owed, and notes on consequences to weigh, such as your own claim superseding the USER's account; a refusal records nothing.";

export const ledgerCommitTool = defineTool({
  name: brunchTools.ledgerCommit,
  description: commitToolDescription,
  parameters: typedJsonSchema<LedgerAppend>(vLedgerAppend),
  structuredOutputSchema: typedJsonSchema<LedgerAppendOutput>(
    ledgerAppendOutputSchema,
  ),
  // Idempotent per call: a rerun after a crash finds its commit in the Ledger and returns the same receipt.
  replay: "safe",
  // Each call folds onto the Ledger its predecessors in the round left.
  executionMode: "sequential",
  execute: async (args, api, context) => {
    // JSON Schema cannot carry the schema's reference checks and route transforms.
    const { entries } = v.parse(vLedgerAppend, args);
    // Its own commit: the tool API cannot write in the commit that records the result.
    const result = await api.commit(
      (tx) => appendToLedger(tx, api.conversationId, api.callId, { entries }),
      context,
    );
    return {
      output: [{ type: "text", text: JSON.stringify(result) }],
      structuredOutput: result,
    };
  },
});

export const ledgerExtension = defineExtension({
  name: "brunch.ledger",
  tools: [ledgerCommitTool],
});
