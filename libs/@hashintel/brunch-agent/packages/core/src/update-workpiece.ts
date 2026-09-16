import { createHash } from "node:crypto";

import * as v from "valibot";

import { evidenceRelationSchema, workpieceRetractionSchema } from "./workpiece";

import type {
  WorkpieceEvidenceSource,
  WorkpieceRetraction,
  WorkpieceRevision,
} from "./workpiece";

/** Model-facing evidence declaration: the passage is cited by its literal text, never by offsets. */
export const evidenceDeclarationSchema = v.strictObject({
  text: v.pipe(
    v.string(),
    v.minLength(1),
    v.maxLength(4096),
    v.description(
      "Literal passage copied exactly from the submitted Markdown (no trimming or normalisation; line breaks allowed). It must occur exactly once unless occurrence selects one of several matches.",
    ),
  ),
  occurrence: v.optional(
    v.pipe(
      v.number(),
      v.integer(),
      v.minValue(0),
      v.description(
        "Zero-based index among the literal occurrences of text in the submitted Markdown, required only when text occurs more than once.",
      ),
    ),
  ),
  messageIds: evidenceRelationSchema.entries.messageIds,
  kind: evidenceRelationSchema.entries.kind,
});

export type WorkpieceEvidenceDeclaration = v.InferOutput<
  typeof evidenceDeclarationSchema
>;

const assertAuthorizedTrueUserSources = (
  messageIds: readonly string[],
  sources: readonly WorkpieceEvidenceSource[],
  subject: "Evidence" | "Retraction",
): void => {
  for (const id of messageIds) {
    const matches = sources.filter((source) => source.id === id);
    if (
      matches.length !== 1 ||
      matches[0]?.role !== "user" ||
      matches[0].purpose !== "user"
    )
      throw new Error(
        `${subject} must resolve to an authorized true-user source in this conversation.`,
      );
  }
};

/** Every literal start offset, advancing one code unit so overlapping occurrences stay visible. */
const literalOccurrences = (content: string, text: string): number[] => {
  const starts: number[] = [];
  let start = content.indexOf(text);
  while (start !== -1) {
    starts.push(start);
    start = content.indexOf(text, start + 1);
  }
  return starts;
};

/**
 * Resolve text-cited declarations to immutable locators in the submitted
 * Markdown. Every failing declaration is reported in one refusal so the model
 * corrects the whole settlement at once; nothing is resolved partially.
 */
export const resolveEvidenceDeclarations = (
  markdown: string,
  declarations: readonly WorkpieceEvidenceDeclaration[],
): v.InferOutput<typeof evidenceRelationSchema>[] => {
  const failures: string[] = [];
  const relations = declarations.flatMap((declaration, index) => {
    const starts = literalOccurrences(markdown, declaration.text);
    const selected =
      declaration.occurrence === undefined
        ? starts.length === 1
          ? starts[0]
          : undefined
        : starts[declaration.occurrence];
    if (selected === undefined) {
      failures.push(
        `evidence[${index}] matched ${starts.length} occurrence(s)${
          declaration.occurrence === undefined
            ? starts.length === 0
              ? ""
              : "; set occurrence to select one"
            : `; occurrence ${declaration.occurrence} is out of range`
        }`,
      );
      return [];
    }
    return [
      {
        locator: { start: selected, end: selected + declaration.text.length },
        messageIds: declaration.messageIds,
        kind: declaration.kind,
      },
    ];
  });
  if (failures.length > 0)
    throw new Error(
      `Evidence text must occur exactly once in the submitted Markdown (or name an occurrence): ${failures.join("; ")}. Nothing was written; resubmit the settlement with corrected evidence.`,
    );
  return relations;
};

/**
 * Validation earns structural linkage and authorship only, never relevance or
 * template quality. Takes locator-form relations (persisted or already
 * resolved) and returns the parsed (mutable) relations so they can be
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
    assertAuthorizedTrueUserSources(relation.messageIds, sources, "Evidence");
  }
  return relations;
};

/** Ceiling in UTF-8 bytes, before hashing; whitespace and line endings are preserved. */
export const workpieceMarkdownByteCeiling = 262_144;
export const workpieceMaximumUnannouncedShrinkRatio = 0.25;

export const validateWorkpieceRetraction = (
  retraction: WorkpieceRetraction | undefined,
  sources: readonly WorkpieceEvidenceSource[],
): void => {
  if (!retraction) return;
  assertAuthorizedTrueUserSources(retraction.messageIds, sources, "Retraction");
  const citedSources = sources.filter((source) =>
    retraction.messageIds.includes(source.id),
  );
  const authorizationOccurrences = citedSources.reduce(
    (count, source) =>
      count +
      literalOccurrences(source.text, retraction.authorizationText).length,
    0,
  );
  if (authorizationOccurrences !== 1)
    throw new Error(
      `Retraction authorization text matched ${authorizationOccurrences} occurrence(s) across its cited true-user sources; it must occur exactly once.`,
    );
  if (
    !retraction.authorizationText
      .toLowerCase()
      .includes(retraction.withdrawn.toLowerCase())
  )
    throw new Error(
      "Retraction authorization text must name the withdrawn material. Nothing was written.",
    );
};

const markdownHeadings = (markdown: string): string[] => {
  const headings: string[] = [];
  let openFence: { marker: "`" | "~"; length: number } | undefined;
  let setextCandidate: string | undefined;
  for (const line of markdown.split(/\r?\n/u)) {
    const fence = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/u);
    if (openFence) {
      const fenceRun = fence?.[1];
      if (
        fenceRun &&
        fenceRun.startsWith(openFence.marker) &&
        fenceRun.length >= openFence.length &&
        fence[2]?.trim() === ""
      )
        openFence = undefined;
      setextCandidate = undefined;
      continue;
    }
    const fenceRun = fence?.[1];
    if (fenceRun) {
      openFence = {
        marker: fenceRun.startsWith("`") ? "`" : "~",
        length: fenceRun.length,
      };
      setextCandidate = undefined;
      continue;
    }
    const atxHeading = line.match(/^ {0,3}(#{1,6})(?:[ \t]+(.*))?$/u);
    if (atxHeading?.[1]) {
      const text = (atxHeading[2] ?? "").replace(/[ \t]+#+[ \t]*$/u, "").trim();
      headings.push(`${atxHeading[1]}${text ? ` ${text}` : ""}`);
      setextCandidate = undefined;
      continue;
    }
    const setextUnderline = line.match(/^ {0,3}(=+|-+)[ \t]*$/u)?.[1];
    if (setextUnderline && setextCandidate) {
      const marker = setextUnderline.startsWith("=") ? "#" : "##";
      headings.push(`${marker} ${setextCandidate}`);
      setextCandidate = undefined;
      continue;
    }
    setextCandidate = /^ {0,3}\S/u.test(line) ? line.trim() : undefined;
  }
  return headings;
};

/** Refuse an unannounced replacement that drops established document structure or content. */
export const assertWorkpieceIsNotSilentShrink = (
  previous: WorkpieceRevision,
  markdown: string,
  retraction?: WorkpieceRetraction,
): void => {
  const candidateHeadings = markdownHeadings(markdown);
  const missingHeadings = markdownHeadings(previous.markdown).filter(
    (heading) => {
      const retainedIndex = candidateHeadings.indexOf(heading);
      if (retainedIndex === -1) return true;
      candidateHeadings.splice(retainedIndex, 1);
      return false;
    },
  );
  const characterDelta = markdown.length - previous.markdown.length;
  const exceedsShrinkLimit =
    characterDelta <
    -previous.markdown.length * workpieceMaximumUnannouncedShrinkRatio;
  if (missingHeadings.length === 0 && !exceedsShrinkLimit) return;
  if (retraction) {
    const invalidRemovedText: number[] = [];
    const removedSpans: { index: number; start: number; end: number }[] = [];
    for (const [index, text] of retraction.removedText.entries()) {
      const occurrences = literalOccurrences(previous.markdown, text);
      const start = occurrences.length === 1 ? occurrences[0] : undefined;
      if (start === undefined || markdown.includes(text)) {
        invalidRemovedText.push(index);
      } else {
        removedSpans.push({ index, start, end: start + text.length });
      }
    }
    const overlappingRemovedText: number[] = [];
    let previousEnd = -1;
    for (const span of removedSpans.toSorted(
      (left, right) => left.start - right.start,
    )) {
      if (span.start < previousEnd) overlappingRemovedText.push(span.index);
      previousEnd = Math.max(previousEnd, span.end);
    }
    if (invalidRemovedText.length > 0 || overlappingRemovedText.length > 0)
      throw new Error(
        `Retraction removedText entries ${[...invalidRemovedText, ...overlappingRemovedText].join(", ")} do not each identify one unique, non-overlapping prior-body excerpt that was actually removed. Character delta: ${characterDelta}. Nothing was written.`,
      );
    const accountedCharacters = removedSpans.reduce(
      (total, span) => total + span.end - span.start,
      0,
    );
    const removedCharacters = -characterDelta;
    if (exceedsShrinkLimit && accountedCharacters < removedCharacters)
      throw new Error(
        `Retraction removedText accounts for ${accountedCharacters} of ${removedCharacters} removed characters. Nothing was written.`,
      );
    const namedRemoval = [retraction.withdrawn, ...retraction.removedText]
      .join("\n")
      .toLowerCase();
    const unnamedHeadings = missingHeadings.filter((heading) => {
      const name = heading.replace(/^#{1,6}\s*/u, "").toLowerCase();
      return !namedRemoval.includes(name);
    });
    if (unnamedHeadings.length === 0) return;
    throw new Error(
      `Retraction does not name missing heading(s): ${unnamedHeadings.join(", ")}. Character delta: ${characterDelta}. Nothing was written.`,
    );
  }

  const losses = [
    ...(missingHeadings.length > 0
      ? [`is missing heading(s): ${missingHeadings.join(", ")}`]
      : []),
    ...(exceedsShrinkLimit ? ["removes more than 25% of the prior body"] : []),
  ];
  throw new Error(
    `Workpiece ${losses.join(" and ")}. Character delta: ${characterDelta}. Nothing was written; resubmit the complete settled account.`,
  );
};

export const updateWorkpieceInputSchema = v.object({
  baseRevisionId: v.pipe(
    v.nullable(v.string()),
    v.description(
      "Revision ID of the current settled workpiece. Use null only for the first revision. Reuse the latest authoritative successful mutate/read result; call read_workpiece only when the current identity or content is unknown or stale.",
    ),
  ),
  markdown: v.pipe(
    v.string(),
    v.description(
      "Complete Markdown for the next workpiece revision, including all unchanged content; this replaces the prior document rather than applying a patch.",
    ),
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
  evidence: v.pipe(
    v.optional(v.array(evidenceDeclarationSchema)),
    v.description(
      "Optional relations from literal passages of this submitted Markdown to the authorized true-user message ids shown as `[message <id>]` in the conversation, with kind declaring each relation's evidential standing. The server resolves each text to an immutable UTF-16 span; a text that is absent or ambiguous refuses the whole settlement. Evidence displaced by an edit above it, or overlapped by a new declaration, must be re-declared. Valid linkage does not establish relevance.",
    ),
  ),
  retraction: v.pipe(
    v.optional(workpieceRetractionSchema),
    v.description(
      "Required only when the submitted Markdown removes an established heading or more than 25% of the prior body. Name the withdrawn material; list unique, non-overlapping prior-Ledger excerpts that the replacement removes and whose total length covers any large net reduction; quote the exact authorization text; and cite the true-user message containing it. Unrelated prose or source identity alone cannot authorize loss.",
    ),
  ),
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
  v.description(
    "Literal text passages to locate in the current settled revision. Results are UTF-16 [start,end) spans valid only for that revision.",
  ),
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
    const starts = literalOccurrences(content, text);
    const occurrences = starts
      .slice(0, 32)
      .map((start) => ({ start, end: start + text.length }));
    return {
      text,
      occurrences,
      matchedCount: starts.length,
      omittedCount: starts.length - occurrences.length,
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
): Omit<WorkpieceRevision, "ordinal" | "evidence" | "evidenceValidated"> & {
  readonly evidence: v.InferOutput<typeof evidenceRelationSchema>[] | undefined;
} => {
  const { markdown, evidence, retraction } = v.parse(
    updateWorkpieceInputSchema,
    input,
  );
  return {
    revisionId: toolCallId,
    sha256: sha256(markdown),
    markdown,
    ...(retraction === undefined ? {} : { retraction }),
    // Declarations resolve against the body they cite before anything else runs.
    evidence:
      evidence === undefined
        ? undefined
        : resolveEvidenceDeclarations(markdown, evidence),
  };
};
