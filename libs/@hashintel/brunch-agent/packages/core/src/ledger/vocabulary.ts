import * as v from "valibot";

import { typedEpistemicFields } from "./notes";

/** One term the model may use, with the meaning the tool description shows. */
export interface LedgerVocabularyTerm {
  readonly name: string;
  readonly description: string;
  /** Dimensions the tool description suggests for entries using this term. */
  readonly covers?: readonly string[];
}

/** A dimension of the model's coverage, with the condition that completes it. */
export interface LedgerDimension {
  readonly name: string;
  readonly description: string;
  readonly done: string;
}

/**
 * Something a finished identity of a kind has. A confirmed Note about the
 * identity naming `covers` meets it, or, when `relation` is set, a confirmed
 * relationship of one of those types with the identity at `end`. A Note about
 * the identity naming `covers` at inapplicable standing closes it either way.
 */
export interface LedgerExpectation {
  readonly name: string;
  readonly description: string;
  readonly covers: string;
  readonly relation?: {
    readonly names: readonly string[];
    readonly end: "from" | "to";
  };
}

/** A kind of identity, with what a finished identity of that kind has. */
export interface LedgerKind extends LedgerVocabularyTerm {
  readonly expects?: readonly LedgerExpectation[];
}

/** The terms coverage is judged against. */
export type LedgerCoverageTerms = Pick<
  LedgerVocabulary,
  "dimensions" | "kinds"
>;

/**
 * The terms of an identity-addressed Ledger. Notes are filed against the
 * identities of the emerging model and the relationships among them rather
 * than fixed categories; this object is the single source for the commit
 * schema's closed vocabularies and the descriptions that explain them.
 */
export interface LedgerVocabulary {
  readonly title: string;
  /** What the account must cover; every entry names the ones it helps cover. */
  readonly dimensions: readonly LedgerDimension[];
  /** Optional, revisable classifications of an identity. */
  readonly kinds: readonly LedgerKind[];
  /** Relationship types; `other` with a label is always available as well. */
  readonly relations: readonly LedgerVocabularyTerm[];
  /** Identities every conversation starts with. */
  readonly fixed: readonly LedgerVocabularyTerm[];
}

/** Note ids take the form `n7`, so identity names may not. */
export const isNoteId = (reference: string): boolean =>
  /^n\d+$/u.test(reference);

const names = (terms: readonly { readonly name: string }[]) =>
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
  const covers = v.pipe(
    v.array(v.picklist(names(vocabulary.dimensions))),
    v.minLength(1),
    v.maxLength(3),
    v.description(
      "The dimensions of the model this entry helps cover; each kind and relation suggests some.",
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
      covers,
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
      covers,
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
      covers,
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
      covers: v.optional(
        v.pipe(covers, v.description("Omit to keep the superseded Note's.")),
      ),
      ...typedEpistemicFields,
    }),
  ]);
  return v.strictObject({
    changes: v.pipe(v.array(change), v.minLength(1), v.maxLength(20)),
  });
};

const term = ({ name, description, covers }: LedgerVocabularyTerm) =>
  `- ${name}${covers ? ` (covers ${covers.join(", ")})` : ""}: ${description}`;

const expectation = ({
  name,
  description,
  covers,
  relation,
}: LedgerExpectation) =>
  `${name} (${relation ? `relation ${relation.names.join(" or ")} ${relation.end} it; ` : ""}dimension ${covers}): ${description}`;

const kindTerm = (kind: LedgerKind) =>
  kind.expects
    ? `${term(kind)}\n  Needs: ${kind.expects.map(expectation).join("; ")}`
    : term(kind);

/** The vocabulary as the tool description shows it. */
export const renderVocabulary = (vocabulary: LedgerVocabulary): string =>
  [
    "Dimensions (what the account must cover, and when each is done):",
    ...vocabulary.dimensions.map(
      ({ name, description, done }) =>
        `- ${name}: ${description} Done when ${done}.`,
    ),
    "",
    "Kinds (optional; revise by superseding the identity Note). Needs are what a finished identity of the kind has, met by a confirmed Note or relationship; a Note about the identity at inapplicable standing covering the need's dimension closes one that does not apply:",
    ...vocabulary.kinds.map(kindTerm),
    "",
    "Relations (from -relation-> to; other takes a label):",
    ...vocabulary.relations.map(term),
    "",
    "Fixed identities (exist from the start; use them in about):",
    ...vocabulary.fixed.map(
      ({ name, description }) => `- ${name}: ${description}`,
    ),
  ].join("\n");
