/** Recover the current Markdown workpiece from canonical Flue history. */

import { createHash } from "node:crypto";

import {
  selectRunbookWorkpiece,
  type WorkpieceEvidenceSource,
  type WorkpieceRevision,
} from "@hashintel/brunch-agent/workpiece";

/** The caller owns the already-authorized instance URL; this never fetches another conversation. */
export const workpieceEvidenceSources = (
  snapshot: FlueConversationSnapshot,
  current?: WorkpieceRevision | null,
): WorkpieceEvidenceSource[] => {
  if (
    current === null &&
    snapshot.messages.some(
      (message) =>
        message.role === "assistant" &&
        message.purpose === "assistant" &&
        message.parts.some(
          (part) =>
            part.type === "dynamic-tool" &&
            part.toolName === "update_workpiece" &&
            part.state === "output-available",
        ),
    )
  )
    throw new Error(
      "Current workpiece state is missing despite a settled revision; recovery is required before another settlement.",
    );
  return snapshot.messages.map((message) => ({
    id: message.id,
    role: message.role,
    purpose: message.purpose,
    text: message.parts
      .flatMap((part) => (part.type === "text" ? [part.text] : []))
      .join(""),
  }));
};

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
