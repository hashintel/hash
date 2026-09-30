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

/**
 * `typed` asks the model for closed epistemic fields; `open` keeps a single
 * free-text disposition, so the two can be compared on the same case.
 */
export type LedgerNoteShape = "typed" | "open";

const changeCore = {
  op: v.pipe(
    v.picklist(["add", "supersede"]),
    v.description(
      "add files a new Note under a category. supersede files a new Note beside an existing one and records that it supersedes it; the earlier Note stays visible.",
    ),
  ),
  address: v.pipe(
    v.string(),
    v.minLength(1),
    v.maxLength(200),
    v.description(
      "add: a category path from the catalogue. supersede: the superseded Note's id (e.g. n7) or full address.",
    ),
  ),
  content: v.pipe(v.string(), v.minLength(1), v.maxLength(12_000)),
};

/** Closed epistemic fields shared by typed and identity-addressed changes. */
export const typedEpistemicFields = {
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

const typedChangeSchema = v.strictObject({
  ...changeCore,
  ...typedEpistemicFields,
});

const openChangeSchema = v.strictObject({
  ...changeCore,
  disposition: v.optional(
    v.pipe(
      v.string(),
      v.minLength(1),
      v.maxLength(300),
      v.description(
        "Optional short author annotation, e.g. direct, inferred, provisional default, disputed. Open vocabulary; displayed without adjudication.",
      ),
    ),
  ),
});

const commitInput = <Change extends v.GenericSchema>(change: Change) =>
  v.strictObject({
    changes: v.pipe(v.array(change), v.minLength(1), v.maxLength(20)),
  });

export const ledgerCommitInputSchemas = {
  typed: commitInput(typedChangeSchema),
  open: commitInput(openChangeSchema),
} as const;

const recordedEpistemic = {
  source: v.optional(v.picklist(ledgerSources)),
  basis: v.optional(v.picklist(ledgerBases)),
  standing: v.optional(v.picklist(ledgerStandings)),
  precision: v.optional(v.picklist(ledgerPrecisions)),
  qualifier: v.optional(v.string()),
  disposition: v.optional(v.string()),
};

/**
 * Reads a recorded change under any shape: category-addressed `add`, shared
 * `supersede`, or the identity-addressed `identify`, `relate` and `note`. The
 * tool validated the input when it ran, so recovery only needs the fields it
 * folds.
 */
const recordedChangeSchema = v.variant("op", [
  v.object({
    op: v.literal("add"),
    address: v.string(),
    content: v.string(),
    ...recordedEpistemic,
  }),
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
  "unknown-category",
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

/** Recognize only a complete refusal; partial lookalikes fail closed. */
export const isRefusedLedgerCommit = (
  output: unknown,
): output is Extract<LedgerCommitOutput, { status: "refused" }> => {
  const parsed = v.safeParse(ledgerCommitOutputSchema, output);
  return parsed.success && parsed.output.status === "refused";
};

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
  readonly disposition?: string;
  /** Address of the Note this one declares it supersedes. */
  readonly supersedes?: string;
  /** Identity-addressed Ledgers: the identity this Note names and describes. */
  readonly identity?: string;
  readonly kind?: string;
  /** Identity-addressed Ledgers: the relationship this Note records. */
  readonly relation?: LedgerRelation;
  /** Identity-addressed Ledgers: identity names or relationship Note ids. */
  readonly about?: readonly string[];
  /** Set when the Note concerns the net draft rather than the operation. */
  readonly concerns?: "draft";
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
>;

const subjectOf = (change: LedgerChange): Filed => {
  switch (change.op) {
    case "add":
    case "supersede":
      return { category: change.address, content: change.content ?? "" };
    case "identify":
      return {
        category: `identities/${change.identity}`,
        content: change.content ?? "",
        identity: change.identity,
        kind: change.kind,
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
      };
    case "note":
      return {
        category: `notes/${change.about.join("+")}`,
        content: change.content,
        about: change.about,
        concerns: change.concerns,
      };
  }
};

/** A superseding Note keeps its predecessor's subject; omitted content and kind carry over. */
const inherit = (predecessor: LedgerNote, change: LedgerChange): Filed => ({
  category: predecessor.category,
  content: change.content ?? predecessor.content,
  identity: predecessor.identity,
  kind: ("kind" in change ? change.kind : undefined) ?? predecessor.kind,
  relation: predecessor.relation,
  about: predecessor.about,
  concerns: predecessor.concerns,
});

const epistemicOf = ({
  source,
  basis,
  standing,
  precision,
  qualifier,
  disposition,
}: LedgerChange) => ({
  source,
  basis,
  standing,
  precision,
  qualifier,
  disposition,
});

const definedOnly = <Value extends object>(value: Value): Value =>
  Object.fromEntries(
    Object.entries(value).filter(([, field]) => field !== undefined),
  ) as Value;
