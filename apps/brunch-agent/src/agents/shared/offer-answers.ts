import { defineTool } from "@flue/runtime";

import {
  brunchTools,
  type LedgerHistory,
  zOfferAnswersInput,
} from "@hashintel/brunch-agent";

import { closesWithCommit } from "./ledger-tools.ts";

export const offerAnswersToolDescription = [
  "Shows the user this turn's questions on their message box, one at a time: each with its text and a button for every answer it offers.",
  "The user picks or types an answer to each, and their answers arrive together as their next message.",
  `Returns at once. Beside the closing ${brunchTools.ledgerCommit} with endTurn it ends the turn; on its own it does not.`,
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
