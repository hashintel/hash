/** Recover the current Markdown workpiece from canonical Flue history. */

import { createHash } from "node:crypto";

import { selectRunbookWorkpiece } from "@hashintel/brunch-agent/workpiece";

import type { FlueConversationSnapshot } from "@flue/sdk";

const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

export interface RecoveredRunbookWorkpiece {
  readonly authorship: "model-produced" | "test-authored";
  readonly content: string;
  readonly fixtureId?: string;
  readonly sha256: string;
  readonly sourceKind: "assistant" | "prepared-signal";
  readonly sourceMessageId: string;
  readonly sourceMessageSha256: string;
  readonly sourceSubmissionId?: string;
}

/**
 * Add content and source hashes to the substrate-neutral current-workpiece
 * selection used by both evaluations and the browser fixture.
 */
export const recoverRunbookWorkpiece = (
  snapshot: FlueConversationSnapshot,
): RecoveredRunbookWorkpiece | undefined => {
  const selected = selectRunbookWorkpiece(snapshot);
  if (selected === undefined) return undefined;

  return {
    authorship: selected.authorship,
    content: selected.content,
    ...(selected.fixtureId === undefined
      ? {}
      : { fixtureId: selected.fixtureId }),
    sha256: sha256(selected.content),
    sourceKind: selected.sourceKind,
    sourceMessageId: selected.sourceMessageId,
    sourceMessageSha256: sha256(JSON.stringify(selected.sourceMessage)),
    ...(selected.sourceSubmissionId === undefined
      ? {}
      : { sourceSubmissionId: selected.sourceSubmissionId }),
  };
};
