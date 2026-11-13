import { defineTool } from "@flue/runtime";
import * as v from "valibot";

import {
  brunchTools,
  commitToolDescription,
  compileToolDescription,
  foldCommits,
  vLedgerAppendOutput,
  type LedgerHistory,
  prepareAppend,
  projectLedger,
  renderLedgerMarkdown,
  vLedgerAppend,
} from "@hashintel/brunch-agent";

const vTextPart = v.object({ type: v.literal("text"), text: v.string() });
const vCallPart = v.object({ toolCallId: v.string() });

/**
 * Whether the turn has replied by this call. History keeps one assistant
 * message per turn, so a commit repaired after a refusal counts the reply
 * written beside the refused call.
 */
const repliesWith = (history: LedgerHistory, toolCallId: string) =>
  history.messages
    .find((message) =>
      message.parts.some(
        (part) => v.is(vCallPart, part) && part.toolCallId === toolCallId,
      ),
    )
    ?.parts.some((part) => v.is(vTextPart, part) && part.text.trim() !== "") ??
  false;

/**
 * The durable `ledger_commit` over this agent's Ledger. An agent may describe
 * its entries with its own `vLedgerAppendWith` schema.
 */
export const createLedgerCommitTool = (
  readHistory: () => Promise<LedgerHistory>,
  input: typeof vLedgerAppend = vLedgerAppend,
) =>
  defineTool({
    name: brunchTools.ledgerCommit,
    description: commitToolDescription,
    input,
    output: vLedgerAppendOutput,
    durable: true,
    async run({ data, toolCallId, signal }) {
      const history = await readHistory();
      signal?.throwIfAborted();
      const output = prepareAppend({
        history,
        toolCallId,
        entries: data.entries,
      });
      return {
        output,
        // Ends the turn only when every call of the step terminates. Before the
        // turn has replied, it stays open so the user gets one.
        terminate:
          data.endTurn === true &&
          output.status === "recorded" &&
          repliesWith(history, toolCallId),
      };
    },
  });

/**
 * The committed Ledger rendered as the Markdown map: `ledger_compile` for the
 * Petrinaut agent, `ledger_query` for the HASH agent.
 */
export const createLedgerCompileTool = (
  readHistory: () => Promise<LedgerHistory>,
  name: string = brunchTools.ledgerCompile,
) =>
  defineTool({
    name,
    description: compileToolDescription,
    input: v.strictObject({}),
    output: v.strictObject({
      revision: v.number(),
      map: v.string(),
      rejected: v.array(v.string()),
    }),
    async run() {
      const { state, revision, rejected } = foldCommits(await readHistory());
      return {
        output: {
          revision,
          rejected: [...rejected],
          map: renderLedgerMarkdown(projectLedger(state)),
        },
        terminate: false,
      };
    },
  });

/** `ledger_commit` and the Ledger map over this agent's Ledger, the map under `queryName`. */
export const createLedgerTools = (
  readHistory: () => Promise<LedgerHistory>,
  input?: typeof vLedgerAppend,
  queryName?: string,
) => [
  createLedgerCommitTool(readHistory, input),
  createLedgerCompileTool(readHistory, queryName),
];
