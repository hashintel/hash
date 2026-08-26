/**
 * A scripted interviewer for the condition-5 harness runner's hermetic test.
 *
 * Loaded by `harness-run.ts` through `BRUNCH_BASELINE_INTERVIEWER_PROVIDER_MODULE`
 * as the runtime's only provider. The responses are decided from what the
 * model can see, not from a fixed sequence, so the fixture stays correct
 * however many model calls the binding's settlement nudge adds to a turn:
 *
 *   1. no ask yet            → ask the objective question
 *   2. an answer, no sweep   → sweep; the extraction call gets one proposal
 *   3. sweep applied         → ask a second question
 *   4. anything after that   → close with text and no question, until the
 *                              runner declares the interview stalled
 */

import {
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall,
  type Context,
} from "@earendil-works/pi-ai";

import { toolName } from "@hashintel/brunch-agent";

import { SDCPN_MODEL_ID } from "../../src/agents/sdcpn-elicitor.ts";

import type { SlotAssertedProposalInput } from "@hashintel/brunch-agent-plugin-sdcpn";

export const FIRST_QUESTION =
  "What decision are you trying to get right, in your own words?";
export const SECOND_QUESTION =
  "When two orders compete for the same line, what does 'better' mean to you?";
export const CLOSING_TEXT =
  "Thank you — I have what I need for now and no further questions.";
/** The expert stub's first reply; the extraction quotes it verbatim. */
export const EXPERT_OBJECTIVE_QUOTE =
  "Which job should each line run next so the week's promises hold.";

const ask = toolName("ask");
const sweep = toolName("sweep");

const objectiveProposal: SlotAssertedProposalInput = {
  evidence: [{ excerpt: EXPERT_OBJECTIVE_QUOTE }],
  epistemicStatus: "explicit",
  confidence: "firm",
  content: {
    value: {
      type: "slot-asserted",
      kind: "objective",
      node: "which job next",
      slot: "the question, in the expert's words",
      precision: "spelled out",
      assertion: { value: EXPERT_OBJECTIVE_QUOTE },
    },
  },
};

const refusedObjectiveProposal: SlotAssertedProposalInput = {
  ...objectiveProposal,
  evidence: [{ excerpt: "This quote is deliberately absent." }],
};

const countToolCalls = (context: Context, name: string): number => {
  let count = 0;
  for (const message of context.messages) {
    if (message.role !== "assistant") continue;
    for (const block of message.content) {
      if (block.type === "toolCall" && block.name === name) count += 1;
    }
  }
  return count;
};

const latestUserText = (context: Context): string | undefined => {
  const latestMessage = context.messages.at(-1);
  if (latestMessage?.role !== "user") return undefined;
  return typeof latestMessage.content === "string"
    ? latestMessage.content
    : latestMessage.content
        .filter((part) => part.type === "text")
        .map((part) => part.text)
        .join("\n");
};

const faux = fauxProvider({
  provider: "anthropic",
  models: [{ id: SDCPN_MODEL_ID }],
});

let extractionCalls = 0;
faux.setResponses(
  Array.from({ length: 64 }, () => (context: Context) => {
    if (context.tools?.some((tool) => tool.name === "finish")) {
      extractionCalls += 1;
      return fauxAssistantMessage(
        [
          fauxToolCall("finish", {
            proposals: [
              process.env["BASELINE_STUB_REFUSE_FIRST_SWEEP"] === "1" &&
              extractionCalls === 1
                ? refusedObjectiveProposal
                : objectiveProposal,
            ],
          }),
        ],
        { stopReason: "toolUse" },
      );
    }
    if (latestUserText(context)?.startsWith("<sweep-repair")) {
      return fauxAssistantMessage([fauxToolCall(sweep, {})], {
        stopReason: "toolUse",
      });
    }
    const asks = countToolCalls(context, ask);
    const sweeps = countToolCalls(context, sweep);
    if (asks === 0) {
      return fauxAssistantMessage(
        [fauxToolCall(ask, { question: FIRST_QUESTION })],
        { stopReason: "toolUse" },
      );
    }
    if (sweeps === 0) {
      return fauxAssistantMessage([fauxToolCall(sweep, {})], {
        stopReason: "toolUse",
      });
    }
    if (asks === 1) {
      return fauxAssistantMessage(
        [fauxToolCall(ask, { question: SECOND_QUESTION })],
        { stopReason: "toolUse" },
      );
    }
    return fauxAssistantMessage(CLOSING_TEXT);
  }),
);

export default faux.provider;
