import {
  interviewBudgetContextKey,
  parseInterviewBudget,
  type InterviewBudget,
} from "./interview-budget";
import { parseWordSpellings, wordsContextKey } from "./words";

import type {
  PetrinautUserMessageBody,
  SubmissionContext,
} from "./contextual-user-message";

/** The host context the website sends with a submission and Brunch reads from it. */
export interface PetrinautSubmissionContext {
  /** The question allowance; absent means Off. */
  readonly interviewBudget?: InterviewBudget;
  /** The conversation's preferred spellings; absent or empty clears them. */
  readonly words?: readonly string[];
}

/**
 * Encode the host context for one submission. With nothing to send it gives
 * `undefined`, so the submission stays an ordinary message.
 */
export const petrinautSubmissionContext = ({
  interviewBudget,
  words,
}: PetrinautSubmissionContext): SubmissionContext | undefined =>
  interviewBudget === undefined && !words?.length
    ? undefined
    : {
        ...(interviewBudget === undefined
          ? {}
          : { [interviewBudgetContextKey]: interviewBudget }),
        ...(words?.length ? { [wordsContextKey]: words } : {}),
      };

/**
 * Read the host context from a parsed user message. An absent or invalid
 * allowance reads as Off, and absent or invalid words as an empty snapshot.
 */
export const readPetrinautSubmissionContext = (
  body: PetrinautUserMessageBody,
): PetrinautSubmissionContext & { readonly words: readonly string[] } => {
  const context =
    body.kind === "contextual" ? body.submissionContext : undefined;
  const interviewBudget = parseInterviewBudget(
    context?.[interviewBudgetContextKey],
  );
  return {
    ...(interviewBudget === undefined ? {} : { interviewBudget }),
    words: parseWordSpellings(context?.[wordsContextKey]),
  };
};
