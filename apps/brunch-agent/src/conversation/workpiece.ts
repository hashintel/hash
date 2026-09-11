/** Recover the current Markdown workpiece from canonical Flue history. */

import { createHash } from "node:crypto";

import * as v from "valibot";

import {
  LEGACY_UPDATE_WORKPIECE_TOOL_NAME,
  MUTATE_WORKPIECE_TOOL_NAME,
  updateWorkpieceInputSchema,
  updateWorkpieceOutputSchema,
} from "@hashintel/brunch-agent/flue";
import {
  selectRunbookWorkpiece,
  type SelectedRunbookWorkpiece,
  type WorkpieceEvidenceSource,
  type WorkpieceRevision,
} from "@hashintel/brunch-agent/workpiece";

import type { FlueConversationPart, FlueConversationSnapshot } from "@flue/sdk";

const settledRevisionFromPart = (
  part: FlueConversationPart,
): WorkpieceRevision | undefined => {
  if (
    part.type !== "dynamic-tool" ||
    (part.toolName !== MUTATE_WORKPIECE_TOOL_NAME &&
      part.toolName !== LEGACY_UPDATE_WORKPIECE_TOOL_NAME) ||
    part.state !== "output-available"
  )
    return undefined;

  const input = v.safeParse(
    v.object({ markdown: updateWorkpieceInputSchema.entries.markdown }),
    part.input,
  );
  const output = v.safeParse(updateWorkpieceOutputSchema, part.output);
  if (!input.success || !output.success) return undefined;

  const { markdown } = input.output;
  const { revisionId, sha256, ordinal, evidence, evidenceValidated } =
    output.output;
  if (
    revisionId !== part.toolCallId ||
    createHash("sha256").update(markdown).digest("hex") !== sha256
  )
    return undefined;

  return {
    revisionId,
    sha256,
    ordinal,
    markdown,
    ...(evidenceValidated === true && evidence !== undefined
      ? { evidence, evidenceValidated }
      : {}),
  };
};

const retainedSettledRevisions = (
  snapshot: FlueConversationSnapshot,
): WorkpieceRevision[] =>
  snapshot.messages.flatMap((message) =>
    message.role === "assistant" && message.purpose === "assistant"
      ? message.parts.flatMap((part) => {
          const revision = settledRevisionFromPart(part);
          return revision === undefined ? [] : [revision];
        })
      : [],
  );

/** Historical citations resolve only actual successful core tool calls, never fenced recovery. */
export const retainedSettledRevision = (
  snapshot: FlueConversationSnapshot,
  revisionId: string,
): WorkpieceRevision | undefined =>
  retainedSettledRevisions(snapshot).find(
    (revision) => revision.revisionId === revisionId,
  );

/** The caller owns the already-authorized instance URL; this never fetches another conversation. */
export const workpieceEvidenceSources = (
  snapshot: FlueConversationSnapshot,
  current?: WorkpieceRevision | null,
): WorkpieceEvidenceSource[] => {
  if (current === null && retainedSettledRevisions(snapshot).length > 0)
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
