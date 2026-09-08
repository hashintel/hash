import { createHash } from "node:crypto";

import * as v from "valibot";

import { isJsonValue } from "./json-value";

import type { WorkpieceRevision } from "./workpiece";

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
  // Carriage only. Authorization, relation validation and passage policy belong to the join.
  evidence: v.optional(v.unknown()),
});

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
