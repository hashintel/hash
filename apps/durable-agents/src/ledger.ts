/**
 * Brunch's `ledger_commit` as a Pi Durable tool, in its own extension. The
 * input schema and result contract are `@hashintel/brunch-agent`'s; only the
 * tool definition changes shape.
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
  type LedgerHistory,
  prepareAppend,
  vLedgerAppend,
} from "@hashintel/brunch-agent";

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

/**
 * The history `prepareAppend` folds: for now only this call, so every commit
 * lands on an empty Ledger. The durable Ledger replaces it.
 */
const thisCallOnly = (callId: string, input: LedgerAppend): LedgerHistory => ({
  messages: [
    {
      id: callId,
      role: "assistant",
      parts: [
        {
          type: "dynamic-tool",
          toolName: brunchTools.ledgerCommit,
          toolCallId: callId,
          state: "input-available",
          input,
        },
      ],
    },
  ],
});

export const ledgerCommitTool = defineTool({
  name: brunchTools.ledgerCommit,
  description: commitToolDescription,
  parameters: typedJsonSchema<LedgerAppend>(vLedgerAppend),
  structuredOutputSchema: typedJsonSchema<LedgerAppendOutput>(
    ledgerAppendOutputSchema,
  ),
  execute: async (args, api) => {
    // JSON Schema cannot carry the schema's reference checks and route transforms.
    const { entries } = v.parse(vLedgerAppend, args);
    const result = prepareAppend({
      history: thisCallOnly(api.callId, { entries }),
      toolCallId: api.callId,
      entries,
    });
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
