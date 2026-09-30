import { findNote, type LedgerCommit, type LedgerNote } from "./notes";
import { isNoteId, type LedgerDimension } from "./vocabulary";

import type { LedgerCompilation } from "./compile";

export interface LedgerMapOptions {
  readonly revision?: number;
  /** Identity names or relationship Note ids to render in full. */
  readonly about?: readonly string[];
  /** `map` (the default) or `full`: the map followed by every Note. */
  readonly detail?: "map" | "full";
  /** Without them, coverage lists only the dimensions Notes name. */
  readonly dimensions?: readonly LedgerDimension[];
}

/** Whether a Note was filed against an identity, a relationship, or both. */
export const isSubjectNote = (note: LedgerNote): boolean =>
  note.identity !== undefined ||
  note.relation !== undefined ||
  note.about !== undefined;

type Stage =
  | "placeholder"
  | "pencilled"
  | "confirmed"
  | "open"
  | "contested"
  | "inapplicable";

/** The lifecycle stage a Note's own declared fields put it at. */
const stageOf = (note: LedgerNote, hasMore: boolean): Stage => {
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

const stageOrder: readonly Stage[] = [
  "confirmed",
  "pencilled",
  "placeholder",
  "open",
  "contested",
  "inapplicable",
];

const coverageLines = (
  view: ReturnType<typeof viewOf>,
  dimensions: readonly LedgerDimension[] | undefined,
): string[] => {
  const operational = view.current.filter(
    ({ concerns }) => concerns !== "draft",
  );
  const listed =
    dimensions ??
    [...new Set(operational.flatMap(({ covers }) => covers ?? []))].map(
      (name) => ({ name, done: undefined }),
    );
  const lines = listed.map(({ name, done }) => {
    const stages = operational
      .filter(({ covers }) => covers?.includes(name))
      .map(view.stage);
    const counts = stageOrder.flatMap((stage) => {
      const count = stages.filter((noteStage) => noteStage === stage).length;
      return count === 0 ? [] : [`${count} ${stage}`];
    });
    const complete =
      stages.includes("confirmed") || stages.includes("inapplicable");
    return `- ${name}: ${counts.length > 0 ? counts.join(", ") : "nothing recorded"}${complete || done === undefined ? "" : `; nothing confirmed — done when ${done}`}`;
  });
  const placeholders = operational
    .filter((note) => view.stage(note) === "placeholder")
    .map(({ identity }) => `\`${identity}\``);
  if (placeholders.length > 0)
    lines.push(`- Placeholders: ${placeholders.join(", ")}.`);
  return lines;
};

/**
 * The account's coverage by dimension: how many current Notes, not counting
 * those on the draft, name each dimension at each stage, and each incomplete
 * dimension's done criterion.
 */
export const summariseCoverage = (
  notes: readonly LedgerNote[],
  dimensions?: readonly LedgerDimension[],
): string =>
  [
    "Coverage by dimension (current Notes, not those on the draft):",
    ...coverageLines(viewOf(notes), dimensions),
  ].join("\n");

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
 * Render an identity-addressed Ledger. The map lists every current identity
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

  const coverage = coverageLines(view, options.dimensions);
  if (coverage.length > 0)
    lines.push(
      "",
      "## Coverage",
      "",
      "Current Notes naming each dimension, not counting those on the draft.",
      "",
      ...coverage,
    );

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
