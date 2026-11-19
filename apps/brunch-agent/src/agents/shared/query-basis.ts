import { defineTool } from "@flue/runtime";
import * as v from "valibot";

import {
  basisQueryReasons,
  basisQueryTarget,
  basisTraceForModel,
  brunchTools,
  callsForElement,
  foldCommits,
  isAppliedChange,
  latestNetDefinition,
  namesBasisQueryTarget,
  queryBasisToolDescription,
  traceLedger,
  basisQueryInputSchema,
} from "@hashintel/brunch-agent";

import {
  netCalls,
  type NetCall,
} from "../../shared/conversation/net-changes.ts";

import type { FlueConversationSnapshot } from "@flue/sdk";
import type {
  BasisQuerySelector,
  BrowserContext,
} from "@hashintel/brunch-agent";

/** The Ledger revision current when a call was made. */
const ledgerRevisionAt = (
  snapshot: FlueConversationSnapshot,
  call: NetCall,
) => {
  const message = snapshot.messages[call.messageIndex];
  if (!message) return undefined;
  return foldCommits({
    messages: [
      ...snapshot.messages.slice(0, call.messageIndex),
      { ...message, parts: message.parts.slice(0, call.partIndex) },
    ],
  }).revision;
};

export const queryBasis = (input: {
  snapshot: FlueConversationSnapshot;
  browser: BrowserContext;
  query: BasisQuerySelector;
}) => {
  // The latest read, or the latest change carrying its read-back; a change
  // after it carried none.
  const calls = netCalls(input.snapshot);
  const latest = latestNetDefinition(calls);
  const view = latest?.call;
  if (
    view &&
    calls.some(
      (call) =>
        isAppliedChange(call) &&
        (call.messageIndex > view.messageIndex ||
          (call.messageIndex === view.messageIndex &&
            call.partIndex > view.partIndex)),
    )
  )
    return {
      binding: input.browser.binding,
      disposition: "stale-read" as const,
      reason: basisQueryReasons["stale-read"],
      target: undefined,
      readToolCallId: view.toolCallId,
      basis: undefined,
      changes: [],
    };
  const target = latest
    ? basisQueryTarget(latest.definition, input.query)
    : undefined;
  if (!target)
    return {
      binding: input.browser.binding,
      disposition: "not-found" as const,
      reason: basisQueryReasons["not-found"],
      target,
      readToolCallId: latest?.call.toolCallId,
      basis: undefined,
      changes: [],
    };
  const changes = callsForElement(calls, {
    kind: input.query.kind,
    id: target.id,
    ...(target.arc === undefined ? {} : { arc: target.arc }),
  }).map((call) => ({
    toolCallId: call.toolCallId,
    operation: call.toolName,
    petrinautRevisionId: call.revisionAfter,
    ledgerRevision: ledgerRevisionAt(input.snapshot, call),
  }));
  const trace = traceLedger(foldCommits(input.snapshot).state, {
    netElement: namesBasisQueryTarget(input.query.kind, target),
  });
  const declared = trace.reflections.length > 0;
  return {
    binding: input.browser.binding,
    disposition: declared
      ? ("basis-declared" as const)
      : ("basis-absent" as const),
    reason: declared
      ? basisQueryReasons["basis-declared"]
      : basisQueryReasons["basis-absent"],
    target,
    readToolCallId: latest?.call.toolCallId,
    basis: declared ? basisTraceForModel(trace) : undefined,
    changes,
  };
};

/**
 * The basis query over the net's recorded changes and this agent's Ledger:
 * `query_basis` for the Petrinaut agent, `ledger_query_basis` for the HASH
 * agent.
 */
export const createQueryBasisTool = (options: {
  browser: BrowserContext;
  history: () => Promise<FlueConversationSnapshot>;
  name?: string;
}) =>
  defineTool({
    name: options.name ?? brunchTools.queryBasis,
    description: queryBasisToolDescription,
    input: basisQueryInputSchema,
    output: v.custom<ReturnType<typeof queryBasis>>(() => true),
    async run({ data }) {
      return {
        output: queryBasis({
          snapshot: await options.history(),
          browser: options.browser,
          query: data.selector,
        }),
        terminate: false,
      };
    },
  });
