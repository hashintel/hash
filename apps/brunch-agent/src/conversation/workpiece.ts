/** Recover the current Markdown workpiece from canonical Flue history. */

import { createHash } from "node:crypto";

import { UPDATE_WORKPIECE_TOOL_NAME } from "@hashintel/brunch-agent/flue";
import {
  selectRunbookWorkpiece,
  type SelectedRunbookWorkpiece,
  type WorkpieceEvidenceSource,
  type WorkpieceRevision,
} from "@hashintel/brunch-agent/workpiece";

import type { FlueConversationSnapshot } from "@flue/sdk";

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
            part.toolName === UPDATE_WORKPIECE_TOOL_NAME &&
            part.state === "output-available",
        ),
    )
  )
    throw new Error(
      "Current workpiece state is missing despite a settled revision; recovery is required before another settlement.",
    );
  // Flue's role and purpose unions are core's; a divergence fails here, at the producer.
  return snapshot.messages.map((message) => ({
    id: message.id,
    role: message.role,
    purpose: message.purpose,
    text: message.parts
      .flatMap((part) => (part.type === "text" ? [part.text] : []))
      .join(""),
  }));
};

const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

/** Core's selection plus content and source hashes; the source message itself is not carried. */
export type RecoveredRunbookWorkpiece = Pick<
  SelectedRunbookWorkpiece,
  | "authorship"
  | "content"
  | "fixtureId"
  | "sourceKind"
  | "sourceMessageId"
  | "sourceSubmissionId"
> & {
  readonly sha256: string;
  readonly sourceMessageSha256: string;
};

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
