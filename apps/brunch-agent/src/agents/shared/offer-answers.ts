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
  `Ask the user this turn's questions, in the same response as the closing ${brunchTools.ledgerCommit} with endTurn.`,
  "This is the only place the questions are asked: each shows on the user's message box, one at a time, with buttons for any answers you offer. Your reply only leads into them in a line, and states neither the questions nor their options.",
  "List every question the turn asks, in order, including the open ones.",
  `Use ${kindUses.slice(0, -1).join(", ")}, and ${kindUses.at(-1)}.`,
  `Never offer choices on ${neverOffer.join(", nor on ")}.`,
  "The user can always answer in their own words.",
].join(" ");

/**
 * The turn's questions, shown on the composer with buttons for the answers
 * it offers. Returns at once; the person's answer arrives as their next
 * ordinary message.
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
