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
    sha256: createHash("sha256").update(markdown, "utf8").digest("hex"),
    markdown,
    ...(evidence === undefined ? {} : { evidence }),
  };
};
