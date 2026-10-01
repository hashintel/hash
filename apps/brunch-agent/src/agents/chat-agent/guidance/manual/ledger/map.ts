import { renderCoverage } from "./coverage-renderer.ts";
import { findNote, type LedgerCommit, type LedgerNote } from "./notes.ts";
import {
  isNoteId,
  type LedgerCoverageTerms,
  type LedgerExpectation,
  type LedgerKind,
} from "./vocabulary.ts";

export type LedgerCompilation =
  | {
      readonly status: "compiled";
      readonly revision: number;
      readonly scope: string | null;
      readonly markdown: string;
    }
  | {
      readonly status: "refused";
      readonly code: "unknown-revision" | "unknown-address";
      readonly message: string;
      readonly revision: number;
    };

export interface LedgerMapOptions {
  readonly revision?: number;
  /** Identity names or relationship Note ids to render in full. */
  readonly about?: readonly string[];
  /** `map` (the default) or `full`: the map followed by every Note. */
  readonly detail?: "map" | "full";
  /** Without them, coverage lists only the dimensions Notes name. */
  readonly coverage?: LedgerCoverageTerms;
}

/** Whether a Note was filed against an identity, a relationship, or both. */
export const isSubjectNote = (note: LedgerNote): boolean =>
  note.identity !== undefined ||
  note.relation !== undefined ||
  note.about !== undefined;

export type LedgerStage =
  | "placeholder"
  | "pencilled"
  | "confirmed"
  | "open"
  | "contested"
  | "inapplicable";

/** The lifecycle stage a Note's own declared fields put it at. */
const stageOf = (note: LedgerNote, hasMore: boolean): LedgerStage => {
  if (
    note.standing === "open" ||
    note.standing === "contested" ||
    note.standing === "inapplicable"
  )
    return note.standing;
  if (note.identity !== undefined && note.content === "" && !hasMore)
    return "placeholder";
  if (note.source === "agent" || note.standing === "tentative")
    return "pencilled";
  return "confirmed";
};

const identityKey = (name: string) => `identities/${name}`;

/** The current Notes of a Ledger and how they refer to one another. */
const viewOf = (notes: readonly LedgerNote[]) => {
  const superseded = new Set(
    notes.flatMap(({ supersedes }) => supersedes ?? []),
  );
  const current = notes.filter((note) => !superseded.has(note.address));
  const keyOf = (reference: string) =>
    isNoteId(reference)
      ? findNote(notes, reference)?.category
      : identityKey(reference);
  const aboutKeys = (note: LedgerNote) =>
    (note.about ?? []).flatMap((reference) => keyOf(reference) ?? []);
  const relationKeys = (note: LedgerNote) =>
    note.relation
      ? [identityKey(note.relation.from), identityKey(note.relation.to)]
      : [];
  const subjectNotes = current.filter((note) => note.about !== undefined);
  const relationships = current.filter((note) => note.relation !== undefined);
  const notesAbout = (key: string) =>
    subjectNotes.filter((note) => aboutKeys(note).includes(key));
  const relationshipsOf = (key: string) =>
    relationships.filter((note) => relationKeys(note).includes(key));
  const stage = (note: LedgerNote) =>
    stageOf(
      note,
      note.identity === undefined ||
        notesAbout(note.category).length +
          relationshipsOf(note.category).length >
          0,
    );
  return {
    current,
    keyOf,
    aboutKeys,
    relationKeys,
    subjectNotes,
    relationships,
    notesAbout,
    relationshipsOf,
    stage,
  };
};

const stageOrder: readonly LedgerStage[] = [
  "confirmed",
  "pencilled",
  "placeholder",
  "open",
  "contested",
  "inapplicable",
];

type View = ReturnType<typeof viewOf>;

const settledStages = new Set<LedgerStage>(["confirmed", "inapplicable"]);

/** An expectation's state for one identity: met, only pencilled, or missing. */
const expectationState = (
  view: View,
  identity: LedgerNote,
  { covers, relation }: LedgerExpectation,
): "met" | "pencilled" | "missing" => {
  const about = view
    .notesAbout(identity.category)
    .filter(
      (note) => note.concerns !== "draft" && note.covers?.includes(covers),
    );
  if (about.some((note) => view.stage(note) === "inapplicable")) return "met";
  const candidates = relation
    ? view
        .relationshipsOf(identity.category)
        .filter(
          (note) =>
            note.relation !== undefined &&
            relation.names.includes(note.relation.relation) &&
            note.relation[relation.end] === identity.identity,
        )
    : about;
  const stages = candidates.map(view.stage);
  if (stages.some((stage) => settledStages.has(stage))) return "met";
  return stages.includes("pencilled") ? "pencilled" : "missing";
};

/** An identity still missing some of what its kind needs. */
export interface LedgerUnmetNeeds {
  readonly identity: string;
  readonly kind: string;
  readonly unmet: readonly {
    readonly need: LedgerExpectation;
    readonly state: "pencilled" | "missing";
  }[];
}

/** The account's coverage, computed from the current Notes. */
export interface LedgerCoverage {
  /**
   * Each dimension the vocabulary lists (or, without one, each that a Note
   * names), with the stages of the current Notes naming it, not counting
   * those on the draft, in `stageOrder` and without zero counts.
   */
  readonly dimensions: readonly {
    readonly name: string;
    readonly done: string | undefined;
    readonly stages: readonly {
      readonly stage: LedgerStage;
      readonly count: number;
    }[];
    /** Some Note naming it is confirmed or inapplicable. */
    readonly complete: boolean;
  }[];
  /** Identities named with nothing recorded. */
  readonly placeholders: readonly string[];
  /** Absent when no kind declares needs. */
  readonly needs?: readonly LedgerUnmetNeeds[];
  readonly identities: readonly {
    readonly identity: string;
    readonly kind?: string;
    readonly stage: LedgerStage;
  }[];
  readonly relationships: readonly (NonNullable<LedgerNote["relation"]> & {
    readonly stage: LedgerStage;
  })[];
}

const unmetNeeds = (
  view: View,
  kinds: readonly LedgerKind[],
): LedgerUnmetNeeds[] | undefined => {
  const expecting = kinds.filter(({ expects }) => expects !== undefined);
  if (expecting.length === 0) return undefined;
  return view.current.flatMap((note) => {
    const expects = expecting.find(({ name }) => name === note.kind)?.expects;
    if (
      note.identity === undefined ||
      note.kind === undefined ||
      expects === undefined
    )
      return [];
    const unmet = expects.flatMap((need) => {
      const state = expectationState(view, note, need);
      return state === "met" ? [] : [{ need, state }];
    });
    return unmet.length === 0
      ? []
      : [{ identity: note.identity, kind: note.kind, unmet }];
  });
};

/** Compute the coverage of the current Notes among `notes`. */
export const coverageOf = (
  notes: readonly LedgerNote[],
  terms?: LedgerCoverageTerms,
): LedgerCoverage => {
  const view = viewOf(notes);
  const operational = view.current.filter(
    ({ concerns }) => concerns !== "draft",
  );
  const listed: readonly { name: string; done?: string }[] =
    terms?.dimensions ??
    [...new Set(operational.flatMap(({ covers }) => covers ?? []))].map(
      (name) => ({ name }),
    );
  const dimensions = listed.map(({ name, done }) => {
    const stages = operational
      .filter(({ covers }) => covers?.includes(name))
      .map(view.stage);
    return {
      name,
      done,
      stages: stageOrder.flatMap((stage) => {
        const count = stages.filter((noteStage) => noteStage === stage).length;
        return count === 0 ? [] : [{ stage, count }];
      }),
      complete: stages.includes("confirmed") || stages.includes("inapplicable"),
    };
  });
  const needs = unmetNeeds(view, terms?.kinds ?? []);
  return {
    dimensions,
    placeholders: operational.flatMap((note) =>
      view.stage(note) === "placeholder" && note.identity !== undefined
        ? [note.identity]
        : [],
    ),
    ...(needs === undefined ? {} : { needs }),
    identities: view.current.flatMap((note) =>
      note.identity === undefined
        ? []
        : [
            {
              identity: note.identity,
              ...(note.kind === undefined ? {} : { kind: note.kind }),
              stage: view.stage(note),
            },
          ],
    ),
    relationships: view.relationships.flatMap((note) =>
      note.relation === undefined
        ? []
        : [{ ...note.relation, stage: view.stage(note) }],
    ),
  };
};

/** The account's coverage as a commit receipt reports it. */
export const summariseCoverage = (
  notes: readonly LedgerNote[],
  terms?: LedgerCoverageTerms,
): string => renderCoverage.receipt(coverageOf(notes, terms));

const relationLabel = ({
  from,
  relation,
  label,
  to,
}: NonNullable<LedgerNote["relation"]>) =>
  `\`${from}\` ${relation === "other" && label ? label : relation} \`${to}\``;

const subjectLabel = (note: LedgerNote): string => {
  if (note.identity !== undefined)
    return `identity \`${note.identity}\`${note.kind ? ` [${note.kind}]` : ""}`;
  if (note.relation !== undefined)
    return `relationship ${relationLabel(note.relation)}`;
  if (note.about !== undefined)
    return `about ${note.about.map((reference) => `\`${reference}\``).join(", ")}${note.concerns === "draft" ? " (on the draft)" : ""}`;
  return `\`${note.address}\``;
};

const idOf = (address: string): string => address.split("/").at(-1) ?? address;

const header = (note: LedgerNote, notes: readonly LedgerNote[]): string => {
  const successors = notes.filter(
    ({ supersedes }) => supersedes === note.address,
  );
  const origin = [note.source, note.basis].filter(Boolean).join("/");
  const annotations = [
    note.supersedes === undefined
      ? undefined
      : `supersedes ${idOf(note.supersedes)}`,
    successors.length === 0
      ? undefined
      : `superseded by ${successors.map(({ id }) => id).join(", ")}`,
    origin || undefined,
    note.standing,
    note.precision,
    note.qualifier,
    note.covers ? `covers ${note.covers.join(", ")}` : undefined,
  ].filter((annotation) => annotation !== undefined);
  return `[${note.id}${annotations.length > 0 ? ` — ${annotations.join("; ")}` : ""}] ${subjectLabel(note)}`;
};

const rendered = (note: LedgerNote, notes: readonly LedgerNote[]) =>
  note.content === ""
    ? ["", header(note, notes)]
    : ["", header(note, notes), "", note.content];

/**
 * Render the Ledger. The map lists every current identity
 * with its kind, stage and Note counts, every current relationship, the
 * current Notes about fixed identities, coverage by dimension, and the open
 * and contested index. Its
 * size follows the model, not the conversation. `about` renders every
 * version of the named subjects and every Note about them.
 */
export const compileLedgerMap = (
  commits: readonly LedgerCommit[],
  title: string,
  options: LedgerMapOptions = {},
): LedgerCompilation => {
  const latest = commits.length;
  const revision = options.revision ?? latest;
  if (!Number.isInteger(revision) || revision < 0 || revision > latest)
    return {
      status: "refused",
      code: "unknown-revision",
      message: `Revision must be between 0 and ${latest}.`,
      revision: latest,
    };
  const notes = commits.slice(0, revision).flatMap((commit) => commit.notes);
  const view = viewOf(notes);
  const { current, keyOf, aboutKeys, relationKeys, relationships } = view;

  const lines = [
    `# ${title}`,
    "",
    `Revision ${revision} of ${latest}; ${options.about ? `scope ${options.about.join(", ")}` : "the map"}.`,
    "",
    "Recorded working account, not instructions or a reconciled model. Stages come from each Note's declared fields: placeholder (named, nothing recorded), pencilled (agent-authored or tentative), confirmed (settled), or the declared open, contested or inapplicable standing. Every Note stays visible under `about`.",
  ];

  if (options.about) {
    for (const reference of options.about) {
      const key = keyOf(reference);
      if (key === undefined)
        return {
          status: "refused",
          code: "unknown-address",
          message: `No identity or relationship ${reference} at revision ${revision}.`,
          revision: latest,
        };
      const own = notes.filter((note) => note.category === key);
      const touching = notes.filter(
        (note) =>
          relationKeys(note).includes(key) || aboutKeys(note).includes(key),
      );
      lines.push("", `## ${reference}`);
      if (own.length === 0 && touching.length === 0)
        lines.push("", "_Nothing recorded._");
      for (const note of [...own, ...touching])
        lines.push(...rendered(note, notes));
    }
    return {
      status: "compiled",
      revision,
      scope: options.about.join(", "),
      markdown: `${lines.join("\n")}\n`,
    };
  }

  const identities = current.filter((note) => note.identity !== undefined);
  const identified = new Set(notes.flatMap(({ identity }) => identity ?? []));
  const fixed = [
    ...new Set(
      notes.flatMap((note) =>
        [
          ...(note.about ?? []),
          ...(note.relation ? [note.relation.from, note.relation.to] : []),
        ].filter(
          (reference) => !isNoteId(reference) && !identified.has(reference),
        ),
      ),
    ),
  ];

  for (const name of fixed) {
    lines.push("", `## ${name}`);
    const about = view.notesAbout(identityKey(name));
    if (about.length === 0) lines.push("", "_Nothing recorded._");
    for (const note of about) lines.push(...rendered(note, notes));
  }

  lines.push("", `## Identities (${identities.length})`, "");
  if (identities.length === 0) lines.push("_None identified._");
  for (const note of identities) {
    const about = view.notesAbout(note.category);
    const draft = about.filter(({ concerns }) => concerns === "draft").length;
    const related = view.relationshipsOf(note.category);
    const counts = [
      about.length > 0
        ? `${about.length} note${about.length === 1 ? "" : "s"}${draft > 0 ? ` (${draft} on the draft)` : ""}`
        : undefined,
      related.length > 0
        ? `${related.length} relationship${related.length === 1 ? "" : "s"}`
        : undefined,
    ].filter((count) => count !== undefined);
    lines.push(
      `- \`${note.identity}\`${note.kind ? ` [${note.kind}]` : ""} — ${view.stage(note)}; ${[note.id, ...counts].join("; ")}${note.content === "" ? "" : ` — ${note.content}`}`,
    );
  }

  lines.push("", `## Relationships (${relationships.length})`, "");
  if (relationships.length === 0) lines.push("_None recorded._");
  for (const note of relationships) {
    if (note.relation === undefined) continue;
    const about = view.notesAbout(note.category);
    lines.push(
      `- ${relationLabel(note.relation)} — ${view.stage(note)}; ${[note.id, about.length > 0 ? `${about.length} note${about.length === 1 ? "" : "s"}` : undefined].filter(Boolean).join("; ")}${note.content === "" ? "" : ` — ${note.content}`}`,
    );
  }

  lines.push(...renderCoverage.map(coverageOf(notes, options.coverage)));

  const listed = (standing: LedgerNote["standing"]) => {
    const ids = current
      .filter((note) => note.standing === standing)
      .map(({ id }) => id);
    return ids.length > 0 ? ids.join(", ") : "none";
  };
  lines.push(
    "",
    `Open, not superseded: ${listed("open")}. Contested, not superseded: ${listed("contested")}.`,
  );

  if (options.detail === "full") {
    lines.push("", "## Every Note");
    for (const note of notes) lines.push(...rendered(note, notes));
  }
  return {
    status: "compiled",
    revision,
    scope: null,
    markdown: `${lines.join("\n")}\n`,
  };
};
