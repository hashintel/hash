import * as v from "valibot";

export const ledgerSources = ["person", "material", "agent"] as const;
export const ledgerBases = [
  "observed",
  "documented",
  "practiced",
  "estimated",
  "assumed",
  "inferred",
] as const;
export const ledgerStandings = [
  "settled",
  "tentative",
  "contested",
  "open",
  "inapplicable",
] as const;
export const ledgerPrecisions = ["approximate", "qualitative"] as const;

/** Closed epistemic fields on every change. */
export const epistemicFields = {
  source: v.pipe(
    v.picklist(ledgerSources),
    v.description(
      "Who supplied this: the person, material they showed or cited, or the agent itself.",
    ),
  ),
  basis: v.optional(
    v.pipe(
      v.picklist(ledgerBases),
      v.description(
        "What it rests on: observed records or events, a documented rule, practiced judgment, an estimate, an assumption (by anyone), or the agent's inference.",
      ),
    ),
  ),
  standing: v.pipe(
    v.picklist(ledgerStandings),
    v.description(
      "settled: accepted as stated. tentative: held but hedged or unconfirmed. contested: two recorded accounts disagree. open: consequential and unknown, unasked or deferred. inapplicable: covered and judged not to apply to this model.",
    ),
  ),
  precision: v.optional(
    v.pipe(
      v.picklist(ledgerPrecisions),
      v.description("For quantities: approximate or only qualitative."),
    ),
  ),
  qualifier: v.optional(
    v.pipe(
      v.string(),
      v.minLength(1),
      v.maxLength(300),
      v.description(
        "Short remaining qualification the fields cannot express, e.g. 'not site-validated'.",
      ),
    ),
  ),
};

const recordedEpistemic = {
  source: v.optional(v.picklist(ledgerSources)),
  basis: v.optional(v.picklist(ledgerBases)),
  standing: v.optional(v.picklist(ledgerStandings)),
  precision: v.optional(v.picklist(ledgerPrecisions)),
  qualifier: v.optional(v.string()),
  covers: v.optional(v.array(v.string())),
};

/**
 * Reads a recorded change. The tool validated the input when it ran, so
 * recovery only needs the fields it folds.
 */
const recordedChangeSchema = v.variant("op", [
  v.object({
    op: v.literal("supersede"),
    address: v.string(),
    content: v.optional(v.string()),
    kind: v.optional(v.string()),
    ...recordedEpistemic,
  }),
  v.object({
    op: v.literal("identify"),
    identity: v.string(),
    kind: v.optional(v.string()),
    content: v.optional(v.string()),
    ...recordedEpistemic,
  }),
  v.object({
    op: v.literal("relate"),
    from: v.string(),
    relation: v.string(),
    label: v.optional(v.string()),
    to: v.string(),
    content: v.optional(v.string()),
    ...recordedEpistemic,
  }),
  v.object({
    op: v.literal("note"),
    about: v.pipe(v.array(v.string()), v.minLength(1)),
    content: v.string(),
    concerns: v.optional(v.literal("draft")),
    ...recordedEpistemic,
  }),
]);

export const recordedCommitInputSchema = v.object({
  changes: v.pipe(v.array(recordedChangeSchema), v.minLength(1)),
});

export type LedgerChange = v.InferOutput<typeof recordedChangeSchema>;

export const ledgerCommitRefusalCodes = [
  "unknown-note",
  "unknown-identity",
  "duplicate-identity",
  "invalid-change",
  "concurrent-commit",
] as const;

export const ledgerCommitOutputSchema = v.variant("status", [
  v.object({
    status: v.literal("recorded"),
    commitId: v.string(),
    revision: v.number(),
    notes: v.array(
      v.object({ address: v.string(), supersedes: v.optional(v.string()) }),
    ),
    /** The account's coverage after this commit. */
    coverage: v.optional(v.string()),
  }),
  v.object({
    status: v.literal("refused"),
    /** Hosts mark a result with `applied: false` as having written nothing. */
    applied: v.literal(false),
    code: v.picklist(ledgerCommitRefusalCodes),
    message: v.string(),
    revision: v.number(),
  }),
]);

export type LedgerCommitOutput = v.InferOutput<typeof ledgerCommitOutputSchema>;

export interface LedgerNote {
  readonly id: string;
  readonly address: string;
  readonly category: string;
  readonly content: string;
  readonly source?: (typeof ledgerSources)[number];
  readonly basis?: (typeof ledgerBases)[number];
  readonly standing?: (typeof ledgerStandings)[number];
  readonly precision?: (typeof ledgerPrecisions)[number];
  readonly qualifier?: string;
  /** Address of the Note this one declares it supersedes. */
  readonly supersedes?: string;
  /** The identity this Note names and describes. */
  readonly identity?: string;
  readonly kind?: string;
  /** The relationship this Note records. */
  readonly relation?: LedgerRelation;
  /** Identity names or relationship Note ids. */
  readonly about?: readonly string[];
  /** Set when the Note concerns the net draft rather than the operation. */
  readonly concerns?: "draft";
  /** The dimensions this Note helps cover. */
  readonly covers?: readonly string[];
}

export interface LedgerRelation {
  readonly from: string;
  readonly relation: string;
  readonly label?: string;
  readonly to: string;
}

export interface LedgerCommit {
  /** The accepting tool call's identity. */
  readonly commitId: string;
  /** One-based position among accepted commits; presentation only. */
  readonly revision: number;
  /** The latest true-user message before this commit, stamped by the host. */
  readonly afterMessageId?: string;
  readonly notes: readonly LedgerNote[];
}

/** A Note is addressed by its id (`n7`) or its full address. */
export const findNote = (
  notes: readonly LedgerNote[],
  reference: string,
): LedgerNote | undefined =>
  notes.find((note) => note.address === reference || note.id === reference);

/**
 * Assign the next Note identities in order. Returns the reference that names
 * no prior Note instead when a supersession target is missing.
 */
export const deriveNotes = (
  prior: readonly LedgerNote[],
  changes: readonly LedgerChange[],
): { notes: LedgerNote[] } | { missingTarget: string } => {
  const notes: LedgerNote[] = [];
  for (const [index, change] of changes.entries()) {
    const predecessor =
      change.op === "supersede" ? findNote(prior, change.address) : undefined;
    if (change.op === "supersede" && !predecessor)
      return { missingTarget: change.address };
    const filed = predecessor
      ? inherit(predecessor, change)
      : subjectOf(change);
    const id = `n${prior.length + index + 1}`;
    notes.push(
      definedOnly({
        ...epistemicOf(change),
        ...filed,
        id,
        address: `${filed.category}/${id}`,
        supersedes: predecessor?.address,
      }),
    );
  }
  return { notes };
};

type Filed = Pick<
  LedgerNote,
  | "category"
  | "content"
  | "identity"
  | "kind"
  | "relation"
  | "about"
  | "concerns"
  | "covers"
>;

const subjectOf = (change: LedgerChange): Filed => {
  switch (change.op) {
    case "supersede":
      return { category: change.address, content: change.content ?? "" };
    case "identify":
      return {
        category: `identities/${change.identity}`,
        content: change.content ?? "",
        identity: change.identity,
        kind: change.kind,
        covers: change.covers,
      };
    case "relate":
      return {
        category: `relationships/${change.from}/${change.relation}/${change.to}`,
        content: change.content ?? "",
        relation: definedOnly({
          from: change.from,
          relation: change.relation,
          label: change.label,
          to: change.to,
        }),
        covers: change.covers,
      };
    case "note":
      return {
        category: `notes/${change.about.join("+")}`,
        content: change.content,
        about: change.about,
        concerns: change.concerns,
        covers: change.covers,
      };
  }
};

/** A superseding Note keeps its predecessor's subject; omitted content, kind and covers carry over. */
const inherit = (predecessor: LedgerNote, change: LedgerChange): Filed => ({
  category: predecessor.category,
  content: change.content ?? predecessor.content,
  identity: predecessor.identity,
  kind: ("kind" in change ? change.kind : undefined) ?? predecessor.kind,
  relation: predecessor.relation,
  about: predecessor.about,
  concerns: predecessor.concerns,
  covers: change.covers ?? predecessor.covers,
});

const epistemicOf = ({
  source,
  basis,
  standing,
  precision,
  qualifier,
}: LedgerChange) => ({
  source,
  basis,
  standing,
  precision,
  qualifier,
});

const definedOnly = <Value extends object>(value: Value): Value =>
  Object.fromEntries(
    Object.entries(value).filter(([, field]) => field !== undefined),
  ) as Value;
