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
  "Your reply must still ask every question in full; this only adds buttons and fields beneath it.",
  "List every question the reply asks, in order.",
  `Use ${kindUses.slice(0, -1).join(", ")}, and ${kindUses.at(-1)}.`,
  `Never offer choices on ${neverOffer.join(", nor on ")}.`,
  "The user can always answer in their own words.",
].join(" ");

const vCallPart = v.object({ toolCallId: v.string() });
const vClosingCommitPart = v.object({
  toolName: v.literal(brunchTools.ledgerCommit),
  input: v.object({ endTurn: v.literal(true) }),
});

/** Whether the response holding this call also holds a commit with `endTurn`. */
const closesWithCommit = (history: LedgerHistory, toolCallId: string) =>
  history.messages
    .find((message) =>
      message.parts.some(
        (part) => v.is(vCallPart, part) && part.toolCallId === toolCallId,
      ),
    )
    ?.parts.some((part) => v.is(vClosingCommitPart, part)) ?? false;

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
