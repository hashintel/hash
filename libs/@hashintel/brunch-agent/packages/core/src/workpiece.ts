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
        "Inclusive UTF-16 offset of the cited passage in this revision's Markdown, resolved by the server from the declared text.",
      ),
    ),
    end: v.pipe(
      v.number(),
      v.integer(),
      v.minValue(1),
      v.description(
        "Exclusive UTF-16 end offset of the same passage; greater than start and within the revision's Markdown.",
      ),
    ),
  }),
  messageIds: v.pipe(
    v.array(v.pipe(v.string(), v.minLength(1))),
    v.description(
      "Authorized true-user message ids, copied from the `[message <id>]` line above each user message in the conversation. Elicited evidence requires at least one; never substitute assistant or tool-call ids.",
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

export const workpieceRetractionSchema = v.strictObject({
  withdrawn: v.pipe(
    v.string(),
    v.minLength(1),
    v.maxLength(4096),
    v.description(
      "Concise identification of the material the user explicitly withdrew.",
    ),
  ),
  authorizationText: v.pipe(
    v.string(),
    v.minLength(1),
    v.maxLength(4096),
    v.description(
      "Literal excerpt copied exactly from the cited true-user message that explicitly authorizes this withdrawal.",
    ),
  ),
  removedText: v.pipe(
    v.array(v.pipe(v.string(), v.minLength(1), v.maxLength(4096))),
    v.minLength(1),
    v.maxLength(16),
    v.description(
      "Exact prior-Ledger excerpts this revision removes. Each must occur exactly once in the prior body, be non-overlapping, and be absent from the replacement; for a large shrink their total length must cover the net character reduction.",
    ),
  ),
  messageIds: v.pipe(
    v.array(v.pipe(v.string(), v.minLength(1))),
    v.minLength(1),
    v.maxLength(8),
    v.description(
      "Authorized true-user message ids that explicitly retract the named material.",
    ),
  ),
});

export type WorkpieceRetraction = ReadonlyDeep<
  v.InferOutput<typeof workpieceRetractionSchema>
>;

/** Tool-call identity and content hash; ordinal is presentation only, never citation identity. */
export const workpieceRevisionPointerSchema = v.object({
  revisionId: v.string(),
  sha256: v.string(),
  ordinal: v.number(),
});

export type WorkpieceRevisionPointer = ReadonlyDeep<
  v.InferOutput<typeof workpieceRevisionPointerSchema>
>;

export const workpieceRefusalCodes = [
  "replay-conflict",
  "stale-base",
  "concurrent-revision",
  "evidence-invalid",
  "retraction-invalid",
  "silent-shrink",
] as const;

export type WorkpieceRefusalCode = (typeof workpieceRefusalCodes)[number];

export const workpieceRefusalCodeSchema = v.picklist(workpieceRefusalCodes);

export const updateWorkpieceRefusedOutputSchema = v.object({
  disposition: v.literal("refused"),
  applied: v.literal(false),
  correctable: v.literal(true),
  code: workpieceRefusalCodeSchema,
  message: v.string(),
  currentRevision: v.nullable(workpieceRevisionPointerSchema),
});

export type WorkpieceRefusedOutput = ReadonlyDeep<
  v.InferOutput<typeof updateWorkpieceRefusedOutputSchema>
>;

/** Recognize only the complete canonical refusal output; partial lookalikes fail closed. */
export const isWorkpieceRefusedOutput = (
  output: unknown,
): output is WorkpieceRefusedOutput =>
  v.safeParse(updateWorkpieceRefusedOutputSchema, output).success;

/** Current settled artifact. Retained legacy carriage is not verified unless evidenceValidated is true. */
export const workpieceRevisionSchema = v.object({
  ...workpieceRevisionPointerSchema.entries,
  markdown: v.string(),
  evidence: v.optional(JsonValueSchema),
  evidenceValidated: v.optional(v.literal(true)),
  retraction: v.optional(workpieceRetractionSchema),
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
