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

/**
 * The host's latest load of another saved version of the open net: a fresh
 * `id` for each load, and the loaded version's decision time.
 */
export interface VersionLoad {
  readonly id: string;
  readonly decisionTime: string;
}

const versionLoadContextKey = "versionLoad";

const parseVersionLoad = (value: unknown): VersionLoad | undefined => {
  if (typeof value !== "object" || value === null) return undefined;
  const { id, decisionTime } = value as Record<string, unknown>;
  return typeof id === "string" &&
    id.length > 0 &&
    id.length <= 100 &&
    typeof decisionTime === "string" &&
    decisionTime.length <= 100 &&
    !Number.isNaN(Date.parse(decisionTime))
    ? { id, decisionTime }
    : undefined;
};

/** The host context a host sends with a submission and Brunch reads from it. */
export interface PetrinautSubmissionContext {
  /** The question allowance; absent means Off. */
  readonly interviewBudget?: InterviewBudget;
  /** The conversation's preferred spellings; absent or empty clears them. */
  readonly words?: readonly string[];
  /** The host's latest version load, while the version it loaded is the base of the open net. */
  readonly versionLoad?: VersionLoad;
}

/**
 * Encode the host context for one submission. With nothing to send it gives
 * `undefined`, so the submission stays an ordinary message.
 */
export const petrinautSubmissionContext = ({
  interviewBudget,
  words,
  versionLoad,
}: PetrinautSubmissionContext): SubmissionContext | undefined =>
  interviewBudget === undefined && !words?.length && versionLoad === undefined
    ? undefined
    : {
        ...(interviewBudget === undefined
          ? {}
          : { [interviewBudgetContextKey]: interviewBudget }),
        ...(words?.length ? { [wordsContextKey]: words } : {}),
        ...(versionLoad === undefined
          ? {}
          : { [versionLoadContextKey]: versionLoad }),
      };

/**
 * Read the host context from a parsed user message. An absent or invalid
 * allowance reads as Off, absent or invalid words as an empty snapshot, and
 * an absent or invalid version load as none.
 */
export const readPetrinautSubmissionContext = (
  body: PetrinautUserMessageBody,
): PetrinautSubmissionContext & { readonly words: readonly string[] } => {
  const context =
    body.kind === "contextual" ? body.submissionContext : undefined;
  const interviewBudget = parseInterviewBudget(
    context?.[interviewBudgetContextKey],
  );
  const versionLoad = parseVersionLoad(context?.[versionLoadContextKey]);
  return {
    ...(interviewBudget === undefined ? {} : { interviewBudget }),
    words: parseWordSpellings(context?.[wordsContextKey]),
    ...(versionLoad === undefined ? {} : { versionLoad }),
  };
};
