import { createHash } from "node:crypto";

import * as v from "valibot";

import { isJsonValue } from "./json-value";
import { evidenceRelationSchema } from "./workpiece";

import type { WorkpieceEvidenceSource, WorkpieceRevision } from "./workpiece";

/**
 * Validation earns structural linkage and authorship only, never relevance or
 * template quality. Returns the parsed (mutable) relations so they can be
 * reported through a tool output; consumers read them as `WorkpieceEvidenceRelation`.
 */
export const settleWorkpieceEvidence = async (
  input: { markdown: string; evidence?: unknown },
  previous: WorkpieceRevision | null,
  readSources: () => Promise<readonly WorkpieceEvidenceSource[]>,
): Promise<v.InferOutput<typeof evidenceRelationSchema>[] | undefined> => {
  const declaredRelations =
    input.evidence === undefined
      ? []
      : v.parse(v.array(evidenceRelationSchema), input.evidence);
  // Only explicit declarations override old relations; carried relations must
  // not suppress other unchanged relations that overlap them.
  const relations = [...declaredRelations];
  // No guessed cross-revision identity. Only a unique unchanged passage at the
  // same span carries; moves/edits/duplicates need an explicit new declaration.
  const retained = v.safeParse(
    v.array(evidenceRelationSchema),
    previous?.evidence,
  );
  if (previous?.evidenceValidated && retained.success) {
    for (const relation of retained.output) {
      const { start, end } = relation.locator;
      const text = previous.markdown.slice(start, end);
      if (
        start >= end ||
        !text ||
        input.markdown.slice(start, end) !== text ||
        previous.markdown.indexOf(text) !== start ||
        previous.markdown.lastIndexOf(text) !== start ||
        input.markdown.indexOf(text) !== start ||
        input.markdown.lastIndexOf(text) !== start ||
        declaredRelations.some(
          (declared) =>
            declared.locator.start < end && declared.locator.end > start,
        )
      )
        continue;
      relations.push(relation);
    }
  }
  if (relations.length === 0)
    return input.evidence === undefined ? undefined : [];
  const sources = await readSources();
  for (const relation of relations) {
    if (
      relation.locator.start >= relation.locator.end ||
      relation.locator.end > input.markdown.length
    )
      throw new Error("Evidence locator is outside the immutable revision.");
    if (relation.kind === "elicited" && relation.messageIds.length === 0)
      throw new Error(
        "Elicited evidence requires an authorized true-user source.",
      );
    for (const id of relation.messageIds) {
      const matches = sources.filter((source) => source.id === id);
      if (
        matches.length !== 1 ||
        matches[0]?.role !== "user" ||
        matches[0].purpose !== "user"
      )
        throw new Error(
          "Evidence must resolve to an authorized true-user source in this conversation.",
        );
    }
  }
  return relations;
};

/** Ceiling in UTF-8 bytes, before hashing; whitespace and line endings are preserved. */
export const workpieceMarkdownByteCeiling = 262_144;
export const updateWorkpieceInputSchema = v.object({
  baseRevisionId: v.optional(v.nullable(v.string())),
  markdown: v.pipe(
    v.string(),
    v.check((markdown) => /\S/u.test(markdown), "Markdown must not be empty."),
    v.check(
      (markdown) => Buffer.from(markdown, "utf8").toString("utf8") === markdown,
      "Markdown must be well-formed Unicode.",
    ),
    v.check(
      (markdown) =>
        Buffer.byteLength(markdown, "utf8") <= workpieceMarkdownByteCeiling,
      "Markdown exceeds the 262144-byte UTF-8 ceiling.",
    ),
  ),
  evidence: v.optional(v.array(evidenceRelationSchema)),
});

export const workpieceMutationSchema = v.object({
  baseRevisionId: v.nullable(v.string()),
  beforeSha256: v.nullable(v.string()),
  afterSha256: v.string(),
  commonPrefixUtf16: v.number(),
  commonSuffixUtf16: v.number(),
  removed: v.object({
    start: v.number(),
    end: v.number(),
    utf16Length: v.number(),
    sha256: v.string(),
  }),
  inserted: v.object({
    start: v.number(),
    end: v.number(),
    utf16Length: v.number(),
    sha256: v.string(),
  }),
});

export type WorkpieceMutation = v.InferOutput<typeof workpieceMutationSchema>;

const sha256 = (content: string): string =>
  createHash("sha256").update(content, "utf8").digest("hex");

export const deriveWorkpieceMutation = (
  previous: WorkpieceRevision | null,
  markdown: string,
): WorkpieceMutation => {
  const before = previous?.markdown ?? "";
  let commonPrefixUtf16 = 0;
  while (
    commonPrefixUtf16 < before.length &&
    commonPrefixUtf16 < markdown.length &&
    before[commonPrefixUtf16] === markdown[commonPrefixUtf16]
  )
    commonPrefixUtf16 += 1;
  let commonSuffixUtf16 = 0;
  while (
    commonSuffixUtf16 < before.length - commonPrefixUtf16 &&
    commonSuffixUtf16 < markdown.length - commonPrefixUtf16 &&
    before[before.length - commonSuffixUtf16 - 1] ===
      markdown[markdown.length - commonSuffixUtf16 - 1]
  )
    commonSuffixUtf16 += 1;
  const removedEnd = before.length - commonSuffixUtf16;
  const insertedEnd = markdown.length - commonSuffixUtf16;
  const removed = before.slice(commonPrefixUtf16, removedEnd);
  const inserted = markdown.slice(commonPrefixUtf16, insertedEnd);
  return {
    baseRevisionId: previous?.revisionId ?? null,
    beforeSha256: previous?.sha256 ?? null,
    afterSha256: sha256(markdown),
    commonPrefixUtf16,
    commonSuffixUtf16,
    removed: {
      start: commonPrefixUtf16,
      end: removedEnd,
      utf16Length: removed.length,
      sha256: sha256(removed),
    },
    inserted: {
      start: commonPrefixUtf16,
      end: insertedEnd,
      utf16Length: inserted.length,
      sha256: sha256(inserted),
    },
  };
};

export const workpieceLocatorTextsSchema = v.pipe(
  v.array(v.pipe(v.string(), v.minLength(1), v.maxLength(4096))),
  v.maxLength(16),
);

/** Candidate identity is hash and length only; no revision, state or evidence. */
export const workpieceLocatorLookupSchema = v.object({
  sha256: v.string(),
  utf16Length: v.number(),
  utf8Bytes: v.number(),
  queries: v.array(
    v.object({
      text: v.string(),
      occurrences: v.array(v.object({ start: v.number(), end: v.number() })),
      matchedCount: v.number(),
      omittedCount: v.number(),
    }),
  ),
});

/** Literal revision-local locators only: no settlement, evidence or continuity is inferred. */
export const lookupWorkpieceLocators = (
  markdown: string,
  texts: readonly string[],
): v.InferOutput<typeof workpieceLocatorLookupSchema> => {
  const content = v.parse(
    updateWorkpieceInputSchema.entries.markdown,
    markdown,
  );
  const queries = v.parse(workpieceLocatorTextsSchema, texts).map((text) => {
    const occurrences: { start: number; end: number }[] = [];
    let matchedCount = 0;
    let start = content.indexOf(text);
    while (start !== -1) {
      matchedCount += 1;
      if (occurrences.length < 32)
        occurrences.push({ start, end: start + text.length });
      // Increment one code unit, so overlapping literal occurrences remain visible.
      start = content.indexOf(text, start + 1);
    }
    return {
      text,
      occurrences,
      matchedCount,
      omittedCount: matchedCount - occurrences.length,
    };
  });
  return {
    sha256: createHash("sha256").update(content, "utf8").digest("hex"),
    utf16Length: content.length,
    utf8Bytes: Buffer.byteLength(content, "utf8"),
    queries,
  };
};

export const prepareWorkpieceRevision = (
  input: v.InferOutput<typeof updateWorkpieceInputSchema>,
  toolCallId: string,
): Omit<WorkpieceRevision, "ordinal"> => {
  const { markdown, evidence } = v.parse(updateWorkpieceInputSchema, input);
  if (evidence !== undefined && !isJsonValue(evidence)) {
    throw new Error("Workpiece evidence must be JSON-compatible.");
  }
  return {
    revisionId: toolCallId,
    sha256: sha256(markdown),
    markdown,
    ...(evidence === undefined ? {} : { evidence }),
  };
};
