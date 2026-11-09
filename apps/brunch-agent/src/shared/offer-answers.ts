import { defineTool } from "@flue/runtime";
import * as v from "valibot";

import {
  brunchTools,
  type LedgerHistory,
  neverOffer,
  questionKinds,
  zOfferAnswersInput,
} from "@hashintel/brunch-agent";

const kindUses = Object.entries(questionKinds).map(
  ([kind, { use }]) => `${kind} ${use}`,
);

export const offerAnswersToolDescription = [
  `Offer quick answers for the questions your reply asks, in the same response as the closing ${brunchTools.ledgerCommit} with endTurn.`,
  "Your reply must still ask every question in full, naming its options; this only adds buttons and fields beneath it.",
  "List every question the reply asks, in order. Call it only when at least one of them is not open.",
  `Use ${kindUses.slice(0, -1).join(", ")}, and ${kindUses.at(-1)}.`,
  `Never offer choices on ${neverOffer.join(", nor on ")}.`,
  "The user can always answer in their own words.",
].join(" ");

const vCallPart = v.object({ toolCallId: v.string() });
const vTextPart = v.object({ type: v.literal("text"), text: v.string() });
const vClosingCommitPart = v.object({
  toolName: v.literal(brunchTools.ledgerCommit),
  input: v.object({ endTurn: v.literal(true) }),
  output: v.optional(v.object({ status: v.literal("recorded") })),
});

/**
 * Whether the message holding this call closes as `ledger_commit` would: it
 * has replied, and holds a commit with `endTurn` still running in this batch
 * or already recorded. One message spans every step of a turn, so a commit
 * that closed nothing in an earlier step must not let this call end it.
 */
const closesWithCommit = (history: LedgerHistory, toolCallId: string) => {
  const parts = history.messages.find((message) =>
    message.parts.some(
      (part) => v.is(vCallPart, part) && part.toolCallId === toolCallId,
    ),
  )?.parts;
  return (
    parts !== undefined &&
    parts.some((part) => v.is(vTextPart, part) && part.text.trim() !== "") &&
    parts.some((part) => v.is(vClosingCommitPart, part))
  );
};

/**
 * Buttons and fields beneath the reply for the questions it asks. Returns at
 * once; the person's answer arrives as their next ordinary message.
 */
export const createOfferAnswersTool = (
  readHistory: () => Promise<LedgerHistory>,
) =>
  defineTool({
    name: brunchTools.offerAnswers,
    description: offerAnswersToolDescription,
    input: zOfferAnswersInput,
    async run({ data, toolCallId, signal }) {
      const history = await readHistory();
      signal?.throwIfAborted();
      return {
        output: { offered: data.questions.length },
        // Flue ends a batch only when every call in it terminates, so the
        // closing commit's own result decides whether this turn ends.
        terminate: closesWithCommit(history, toolCallId),
      };
    },
  });
