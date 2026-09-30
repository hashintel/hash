import * as v from "valibot";

import { typedEpistemicFields } from "./notes";

/** One term the model may use, with the meaning the tool description shows. */
export interface LedgerVocabularyTerm {
  readonly name: string;
  readonly description: string;
}

/**
 * The terms of an identity-addressed Ledger. Notes are filed against the
 * identities of the emerging model and the relationships among them rather
 * than fixed categories; this object is the single source for the commit
 * schema's closed vocabularies and the descriptions that explain them.
 */
export interface LedgerVocabulary {
  readonly title: string;
  /** Optional, revisable classifications of an identity. */
  readonly kinds: readonly LedgerVocabularyTerm[];
  /** Relationship types; `other` with a label is always available as well. */
  readonly relations: readonly LedgerVocabularyTerm[];
  /** Identities every conversation starts with. */
  readonly fixed: readonly LedgerVocabularyTerm[];
}

/** Note ids take the form `n7`, so identity names may not. */
export const isNoteId = (reference: string): boolean =>
  /^n\d+$/u.test(reference);

const names = (terms: readonly LedgerVocabularyTerm[]) =>
  terms.map(({ name }) => name);

const identityName = v.pipe(
  v.string(),
  v.regex(/^[a-z][a-z0-9-]*$/u),
  v.maxLength(60),
  v.description(
    "A lowercase kebab-case identity name in the person's vocabulary, e.g. cleaning-crew.",
  ),
);

const content = v.pipe(v.string(), v.minLength(1), v.maxLength(12_000));

/** The `ledger_commit` input for an identity-addressed Ledger. */
export const identityCommitInputSchema = (vocabulary: LedgerVocabulary) => {
  const kind = v.pipe(
    v.picklist(names(vocabulary.kinds)),
    v.description(
      "Optional; leave it out until it is clear, and revise it by superseding.",
    ),
  );
  const change = v.variant("op", [
    v.strictObject({
      op: v.literal("identify"),
      identity: identityName,
      kind: v.optional(kind),
      content: v.optional(
        v.pipe(
          content,
          v.description(
            "What is known about it. Omit for a bare placeholder: named, nothing known yet.",
          ),
        ),
      ),
      ...typedEpistemicFields,
    }),
    v.strictObject({
      op: v.literal("relate"),
      from: identityName,
      relation: v.picklist([...names(vocabulary.relations), "other"]),
      label: v.optional(
        v.pipe(
          v.string(),
          v.minLength(1),
          v.maxLength(60),
          v.description(
            "Required when relation is other, e.g. 'available during'.",
          ),
        ),
      ),
      to: identityName,
      content: v.optional(content),
      ...typedEpistemicFields,
    }),
    v.strictObject({
      op: v.literal("note"),
      about: v.pipe(
        v.array(v.pipe(v.string(), v.minLength(1))),
        v.minLength(1),
        v.maxLength(8),
        v.description(
          "The identities (by name) and relationships (by Note id, e.g. n12) this Note is about.",
        ),
      ),
      content,
      concerns: v.optional(
        v.pipe(
          v.literal("draft"),
          v.description(
            "Set when the Note is about the net draft (a representation choice, stand-in, discrepancy or check) rather than the operation.",
          ),
        ),
      ),
      ...typedEpistemicFields,
    }),
    v.strictObject({
      op: v.literal("supersede"),
      address: v.pipe(
        v.string(),
        v.regex(/^n\d+$/u),
        v.description("The superseded Note's id, e.g. n7."),
      ),
      content: v.optional(
        v.pipe(
          content,
          v.description("Omit to keep the superseded Note's content."),
        ),
      ),
      kind: v.optional(kind),
      ...typedEpistemicFields,
    }),
  ]);
  return v.strictObject({
    changes: v.pipe(v.array(change), v.minLength(1), v.maxLength(20)),
  });
};

/** The vocabulary as the tool description shows it. */
export const renderVocabulary = (vocabulary: LedgerVocabulary): string =>
  [
    "Kinds (optional; revise by superseding the identity Note):",
    ...vocabulary.kinds.map(
      ({ name, description }) => `- ${name}: ${description}`,
    ),
    "",
    "Relations (from -relation-> to; other takes a label):",
    ...vocabulary.relations.map(
      ({ name, description }) => `- ${name}: ${description}`,
    ),
    "",
    "Fixed identities (exist from the start; use them in about):",
    ...vocabulary.fixed.map(
      ({ name, description }) => `- ${name}: ${description}`,
    ),
  ].join("\n");
