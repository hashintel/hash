import {
  interviewBudgetContextKey,
  parseInterviewBudget,
  type InterviewBudget,
} from "./interview-budget";
import { parseSelection, selectionContextKey } from "./selection";
import { parseWordSpellings, wordsContextKey } from "./words";

import type {
  PetrinautUserMessageBody,
  SubmissionContext,
} from "./contextual-user-message";
import type { SelectionItem } from "@hashintel/petrinaut-core/selection";

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
    typeof decisionTime === "string" &&
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
  /**
   * The editor's selection when the user sent the turn; absent or empty means
   * nothing selected. It applies to that turn only.
   */
  readonly selection?: readonly SelectionItem[];
}

/**
 * Encode the host context for one submission. With nothing to send it gives
 * `undefined`, so the submission stays an ordinary message.
 */
export const petrinautSubmissionContext = ({
  interviewBudget,
  words,
  versionLoad,
  selection,
}: PetrinautSubmissionContext): SubmissionContext | undefined =>
  interviewBudget === undefined &&
  !words?.length &&
  versionLoad === undefined &&
  !selection?.length
    ? undefined
    : {
        ...(interviewBudget === undefined
          ? {}
          : { [interviewBudgetContextKey]: interviewBudget }),
        ...(words?.length ? { [wordsContextKey]: words } : {}),
        ...(versionLoad === undefined
          ? {}
          : { [versionLoadContextKey]: versionLoad }),
        ...(selection?.length ? { [selectionContextKey]: selection } : {}),
      };

/**
 * Read the host context from a parsed user message. An absent or invalid
 * allowance reads as Off, absent or invalid words as an empty snapshot, an
 * absent or invalid version load as none, and an absent or invalid selection
 * as nothing selected.
 */
export const readPetrinautSubmissionContext = (
  body: PetrinautUserMessageBody,
): PetrinautSubmissionContext & {
  readonly words: readonly string[];
  readonly selection: readonly SelectionItem[];
} => {
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
    selection: parseSelection(context?.[selectionContextKey]),
  };
};
