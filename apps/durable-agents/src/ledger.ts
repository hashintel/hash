/**
 * Brunch's Ledger tools as Pi Durable tools, in their own extension. The
 * input schemas, descriptions and result contracts are
 * `@hashintel/brunch-agent`'s; only the tool definitions change shape.
 * Commits accumulate in the conversation's `LedgerDoc`, which the tools read
 * and edit.
 *
 * `createLedgerExtension(host)` is the HASH agent's: `ledger_commit` with
 * HASH's `evidenced` wording, ending the turn on `endTurn` once the exchange
 * has replied (fold 7), and `ledger_query`.
 */
import {
  defineExtension,
  defineTool,
  LiveDoc,
  type ToolExecutionApi,
  type ToolTaskInput,
} from "@earendil-works/pi-durable";
import { toJsonSchema } from "@valibot/to-json-schema";
import * as v from "valibot";

import {
  brunchTools,
  commitToolDescription,
  compileToolDescription,
  foldCommits,
  hashEvidencedDescription,
  type LedgerAppend,
  projectLedger,
  renderLedgerMarkdown,
  vLedgerAppend,
  vLedgerAppendOutput,
  vLedgerAppendWith,
  vOriginWith,
} from "@hashintel/brunch-agent";

import {
  appendToLedger,
  LedgerDoc,
  type LedgerAppendOutput,
  ledgerHistoryAt,
} from "./ledger-doc/ledger-doc";

import type { HostBinding } from "./agent/host-binding";
import type { Context } from "@earendil-works/chord";
import type { Schema } from "@earendil-works/pi-schema";

export { foldLedger, LedgerDoc } from "./ledger-doc/ledger-doc";

/** A Valibot schema as the JSON Schema Flue sends a model (`toolInputToJsonSchema`), typed for Pi. */
const typedJsonSchema = <T>(schema: v.GenericSchema) => {
  const { $schema: _schema, ...jsonSchema } = toJsonSchema(schema, {
    errorMode: "ignore",
  });
  return jsonSchema as Schema<T>;
};

/** HASH's Ledger entries: what the agent reads from HASH counts as evidenced too (Brunch's `guidance.ts`). */
export const hashLedgerAppend = vLedgerAppendWith(
  vOriginWith(hashEvidencedDescription),
);

/** The extension's name, which a conversation's stored agent selects. */
export const ledgerExtensionName = "brunch.ledger";

/**
 * Whether the exchange has replied by the call: some assistant entry from the
 * run's first entry through the call's own has non-whitespace text in what
 * the model was sent. By the one-input rule a run is one exchange, so a reply
 * written beside a refused commit in an earlier round counts (Brunch's
 * repaired commit); an earlier run's reply does not.
 *
 * Read through the host at the call's assistant entry, a fixed cutoff, so a
 * rerun after a restart decides the same. Outside any commit. A run that
 * lacks `run.first` counts the call's own entry only, so it at worst keeps
 * the turn open for one more request.
 */
const exchangeHasReplied = async (
  host: HostBinding,
  api: Pick<
    ToolExecutionApi,
    "conversationId" | "taskId" | "getTask" | "snapshot"
  >,
  context: Context,
): Promise<boolean> => {
  const input = (await api.getTask(api.taskId, context))?.input as
    | ToolTaskInput
    | undefined;
  if (input?.kind !== "model") return false;
  const { assistant } = input;
  const first =
    (await api.snapshot(LiveDoc, api.conversationId, context))?.run?.first ??
    assistant;
  const view = await (
    await host.conversation(api.conversationId, context)
  ).context(context, { at: assistant });
  return view.entries.some(
    (entry, index) =>
      entry.kind === "pi.assistant" &&
      entry.id >= first &&
      entry.id <= assistant &&
      (view.contributions[index] ?? []).some(
        (message) =>
          message.role === "assistant" &&
          message.content.some(
            (part) => part.type === "text" && part.text.trim() !== "",
          ),
      ),
  );
};

/**
 * `ledger_commit` over `input`, Brunch's append schema or an agent's own.
 * With `endsTurn`, a recorded commit with `endTurn` asks Pi to end the run,
 * which it does only when every result of the round asks to.
 */
const defineLedgerCommitTool = ({
  description,
  input,
  endsTurn,
}: {
  readonly description: string;
  readonly input: typeof vLedgerAppend;
  readonly endsTurn?: (
    api: ToolExecutionApi,
    context: Context,
  ) => Promise<boolean>;
}) =>
  defineTool({
    name: brunchTools.ledgerCommit,
    description,
    parameters: typedJsonSchema<LedgerAppend>(input),
    structuredOutputSchema:
      typedJsonSchema<LedgerAppendOutput>(vLedgerAppendOutput),
    // Idempotent per call: a rerun after a crash finds its commit in the Ledger and returns the same receipt.
    replay: "safe",
    // Each call folds onto the Ledger its predecessors in the round left.
    executionMode: "sequential",
    execute: async (args, api, context) => {
      // JSON Schema cannot carry the schema's reference checks and route transforms.
      const { entries, endTurn } = v.parse(input, args);
      // Its own commit: the tool API cannot write in the commit that records the result.
      const result = await api.commit(
        (tx) => appendToLedger(tx, api.conversationId, api.callId, { entries }),
        context,
      );
      // A refused commit leaves the turn open for its repair.
      const terminate =
        endTurn === true &&
        result.status === "recorded" &&
        endsTurn !== undefined &&
        (await endsTurn(api, context));
      return {
        output: [{ type: "text", text: JSON.stringify(result) }],
        structuredOutput: result,
        ...(terminate ? { control: { terminate: true } } : {}),
      };
    },
  });

const vLedgerQueryInput = v.strictObject({});

const vLedgerQueryOutput = v.strictObject({
  revision: v.number(),
  map: v.string(),
  rejected: v.array(v.string()),
});

type LedgerQueryOutput = v.InferOutput<typeof vLedgerQueryOutput>;

/**
 * `ledger_query`: the Ledger as its current map, as Brunch's Ledger map tool
 * renders it. The history is the stored one plus the turns opened since, so
 * comments without a commit yet are in the map. Sequential, so it sees the
 * commits issued before it in the same response.
 */
const ledgerQueryTool = defineTool({
  name: brunchTools.ledgerQuery,
  description: compileToolDescription,
  parameters:
    typedJsonSchema<v.InferOutput<typeof vLedgerQueryInput>>(vLedgerQueryInput),
  structuredOutputSchema:
    typedJsonSchema<LedgerQueryOutput>(vLedgerQueryOutput),
  // Reads only.
  replay: "safe",
  executionMode: "sequential",
  execute: async (_args, api, context) => {
    const { conversationId, callId } = api;
    const stored = await api.snapshot(LedgerDoc, conversationId, context);
    // A commit that only reads: the entries since the stored history's last turn.
    const history = await api.commit(
      (tx) => ledgerHistoryAt(tx, conversationId, callId, stored),
      context,
    );
    const { state, revision, rejected } = foldCommits(history);
    const output: LedgerQueryOutput = {
      revision,
      rejected: [...rejected],
      map: renderLedgerMarkdown(projectLedger(state)),
    };
    return {
      output: [{ type: "text", text: JSON.stringify(output) }],
      structuredOutput: output,
    };
  },
});

/**
 * The HASH agent's Ledger extension over a Harness's host binding:
 * `ledger_commit` with HASH's append schema and Brunch's description, ending
 * the turn on `endTurn` once the exchange has replied, and `ledger_query`.
 */
export const createLedgerExtension = (host: HostBinding) =>
  defineExtension({
    name: ledgerExtensionName,
    tools: [
      defineLedgerCommitTool({
        description: commitToolDescription,
        input: hashLedgerAppend,
        endsTurn: (api, context) => exchangeHasReplied(host, api, context),
      }),
      ledgerQueryTool,
    ],
  });
