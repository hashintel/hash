import { defineTool } from "@flue/runtime";

import {
  brunchTools,
  type LedgerHistory,
  neverOffer,
  questionKinds,
  zOfferAnswersInput,
} from "@hashintel/brunch-agent";

import { closesWithCommit } from "./ledger-tools.ts";

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
    async run({ data, toolCallId }) {
      const history = await readHistory();
      return {
        output: { offered: data.questions.length },
        // Flue ends a batch only when every call in it terminates, so the
        // closing commit's own result decides whether this turn ends. Without
        // a reply this call keeps the turn open, so the user still gets one.
        terminate: closesWithCommit(history, toolCallId),
      };
    },
  });
