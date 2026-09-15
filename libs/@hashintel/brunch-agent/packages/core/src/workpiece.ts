/**
 * Substrate-neutral selection of the current Markdown workpiece from an
 * append-only conversation projection.
 */

import * as v from "valibot";

import { JsonValueSchema } from "./json-value";

import type { ReadonlyDeep } from "./readonly-deep";

export const workpieceRevisionStateKey = "brunch.workpiece.current.v1";

/** Locators have meaning only within their immutable revision's Markdown. */
export const evidenceRelationSchema = v.strictObject({
  locator: v.strictObject({
    start: v.pipe(
      v.number(),
      v.integer(),
      v.minValue(0),
      v.description(
        "Inclusive UTF-16 offset from read_workpiece locateTexts for the exact Markdown being submitted.",
      ),
    ),
    end: v.pipe(
      v.number(),
      v.integer(),
      v.minValue(1),
      v.description(
        "Exclusive UTF-16 end offset from the same match; greater than start and within the submitted Markdown.",
      ),
    ),
  }),
  messageIds: v.pipe(
    v.array(v.pipe(v.string(), v.minLength(1))),
    v.description(
      "Authorized true-user source IDs returned by read_workpiece. Elicited evidence requires at least one; never substitute assistant or tool-call IDs.",
    ),
  ),
  kind: v.pipe(
    v.picklist([
      "elicited",
      "inference",
      "default",
      "formalism-constraint",
      "external",
      "correction",
    ]),
    v.description(
      "Standing of this passage: user testimony (elicited), representational reasoning (inference), a chosen default, a formalism constraint, external material, or a correction. Linkage does not establish semantic support.",
    ),
  ),
});

export type WorkpieceEvidenceRelation = ReadonlyDeep<
  v.InferOutput<typeof evidenceRelationSchema>
>;

/**
 * Core stays substrate-neutral, so these finite unions are owned here; the app
 * pins its substrate projection against them at the producer.
 */
export type WorkpieceMessageRole = "user" | "assistant" | "system";
export type WorkpieceMessagePurpose =
  | "user"
  | "assistant"
  | "dispatch"
  | "advisory";

/** The app acquires these from this instance's authorized public history. */
export interface WorkpieceEvidenceSource {
  readonly id: string;
  readonly role: WorkpieceMessageRole;
  readonly purpose: WorkpieceMessagePurpose;
  readonly text: string;
}

export interface WorkpieceEvidenceServices {
  readonly currentRevision: WorkpieceRevision | null;
  readonly readSources: () => Promise<readonly WorkpieceEvidenceSource[]>;
}

/** Tool-call identity and content hash; ordinal is presentation only, never citation identity. */
export const workpieceRevisionPointerSchema = v.object({
  revisionId: v.string(),
  sha256: v.string(),
  ordinal: v.number(),
});

/** Current settled artifact. Retained legacy carriage is not verified unless evidenceValidated is true. */
export const workpieceRevisionSchema = v.object({
  ...workpieceRevisionPointerSchema.entries,
  markdown: v.string(),
  evidence: v.optional(JsonValueSchema),
  evidenceValidated: v.optional(v.literal(true)),
});

export type WorkpieceRevision = ReadonlyDeep<
  v.InferOutput<typeof workpieceRevisionSchema>
>;

export const runbookIrFence = "runbook-ir";

type WorkpieceTextPart = {
  readonly text: string;
  readonly type: "text";
};

export interface WorkpieceHistoryMessage {
  readonly body?: string;
  readonly id: string;
  readonly parts: readonly (
    | WorkpieceTextPart
    | { readonly type: string; readonly [key: string]: unknown }
  )[];
  readonly purpose: WorkpieceMessagePurpose;
  readonly role: WorkpieceMessageRole;
  readonly signal?: {
    readonly attributes?: Readonly<Record<string, string>>;
    readonly tagName?: string;
    readonly type?: string;
  };
  readonly submissionId?: string;
}

export interface WorkpieceHistory {
  readonly conversationId: string;
  readonly messages: readonly WorkpieceHistoryMessage[];
}

export interface SelectedRunbookWorkpiece {
  readonly content: string;
  /**
   * Position in the append-only revision sequence, derived from the history
   * itself: the first eligible assistant workpiece is revision zero and each
   * later one adds one.
   */
  readonly revision: number;
  readonly sourceMessage: WorkpieceHistoryMessage;
  readonly sourceMessageId: string;
  readonly sourceSubmissionId?: string;
}

const openingRunbookIrFence = `\`\`\`${runbookIrFence}`;
const closingFence = "```";

export const latestRunbookIrBlock = (text: string): string | undefined => {
  let last: string | undefined;
  let searchFrom = 0;
  while (searchFrom < text.length) {
    const openAt = text.indexOf(openingRunbookIrFence, searchFrom);
    if (openAt === -1) {
      break;
    }
    let cursor = openAt + openingRunbookIrFence.length;
    let lastNewline: number | undefined;
    while (cursor < text.length) {
      const character = text[cursor];
      if (character === undefined || character.trim() !== "") {
        break;
      }
      if (character === "\n") {
        lastNewline = cursor;
      }
      cursor += 1;
    }
    if (lastNewline === undefined) {
      searchFrom = openAt + 1;
      continue;
    }
    const contentStart = lastNewline + 1;
    const closeAt = text.indexOf(closingFence, contentStart);
    if (closeAt === -1) {
      break;
    }
    last = text.slice(contentStart, closeAt).trim();
    searchFrom = closeAt + closingFence.length;
  }
  return last;
};

const textFrom = (message: WorkpieceHistoryMessage): string =>
  message.parts
    .filter((part): part is WorkpieceTextPart => part.type === "text")
    .map((part) => part.text)
    .join("\n");

const selectedFrom = (
  message: WorkpieceHistoryMessage,
  revision: number,
): SelectedRunbookWorkpiece | undefined => {
  const content = latestRunbookIrBlock(textFrom(message));
  if (content === undefined) return undefined;

  return {
    revision,
    content,
    sourceMessage: message,
    sourceMessageId: message.id,
    ...(message.submissionId === undefined
      ? {}
      : { sourceSubmissionId: message.submissionId }),
  };
};

/** The latest assistant reply carrying a fenced runbook-ir block wins in log order. */
export const selectRunbookWorkpiece = (
  history: WorkpieceHistory,
): SelectedRunbookWorkpiece | undefined => {
  let selected: SelectedRunbookWorkpiece | undefined;

  for (const message of history.messages) {
    if (message.purpose !== "assistant" || message.role !== "assistant") {
      continue;
    }
    const assistantWorkpiece = selectedFrom(
      message,
      selected === undefined ? 0 : selected.revision + 1,
    );
    if (assistantWorkpiece !== undefined) selected = assistantWorkpiece;
  }

  return selected;
};
