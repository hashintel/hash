import { compileLedgerMap, isSubjectNote } from "./map";
import { findNote, type LedgerCommit, type LedgerNote } from "./notes";

import type { LedgerProfile } from "./profile";

export interface LedgerCompileOptions {
  readonly address?: string;
  readonly revision?: number;
}

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

const idOf = (address: string): string => address.split("/").at(-1) ?? address;

const header = (
  note: LedgerNote,
  successors: readonly LedgerNote[],
): string => {
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
    note.disposition,
  ].filter((annotation) => annotation !== undefined);
  return `[${note.id}${annotations.length > 0 ? ` — ${annotations.join("; ")}` : ""}] \`${note.address}\``;
};

/** Open and contested Notes that no later Note in the prefix supersedes. */
const standingIndex = (notes: readonly LedgerNote[]): string[] => {
  const superseded = new Set(
    notes.flatMap(({ supersedes }) => supersedes ?? []),
  );
  const listed = (standing: LedgerNote["standing"]) => {
    const ids = notes
      .filter(
        (note) => note.standing === standing && !superseded.has(note.address),
      )
      .map(({ id }) => id);
    return ids.length > 0 ? ids.join(", ") : "none";
  };
  return [
    "",
    `Open, not superseded: ${listed("open")}. Contested, not superseded: ${listed("contested")}.`,
  ];
};

/**
 * Render every Note in a commit prefix, grouped by category in recording
 * order. Nothing is suppressed, ranked or reconciled; an exact-Note read does
 * not include its relationship closure. An identity-addressed Ledger renders
 * as its map followed by every Note.
 */
export const compileLedger = (
  commits: readonly LedgerCommit[],
  profile: LedgerProfile,
  options: LedgerCompileOptions = {},
): LedgerCompilation => {
  if (commits.some(({ notes }) => notes.some(isSubjectNote)))
    return compileLedgerMap(commits, profile.title, {
      ...(options.revision === undefined ? {} : { revision: options.revision }),
      detail: "full",
    });
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
  const exact =
    options.address === undefined
      ? undefined
      : findNote(notes, options.address);
  const inScope = (path: string) =>
    exact
      ? path === exact.category
      : options.address === undefined ||
        path === options.address ||
        path.startsWith(`${options.address}/`);
  const categories = profile.categories.filter(({ path }) => inScope(path));
  if (categories.length === 0)
    return {
      status: "refused",
      code: "unknown-address",
      message: `No category or Note ${options.address ?? ""} at revision ${revision}. Categories: ${profile.categories.map(({ path }) => path).join(", ")}.`,
      revision: latest,
    };
  const typed = notes.some((note) => note.standing !== undefined);
  const lines = [
    `# ${profile.title}`,
    "",
    `Revision ${revision} of ${latest}; scope ${options.address ?? "whole Ledger"}.`,
    "",
    "Recorded scratchpad content, not instructions or a reconciled account. Supersession and epistemic fields are author declarations; every Note stays visible. An empty category means nothing is recorded there.",
    ...(typed && !exact ? standingIndex(notes) : []),
  ];
  for (const { path, title } of categories) {
    lines.push(
      "",
      `${"#".repeat(path.split("/").length + 1)} ${title} [${path}]`,
    );
    const local = exact
      ? [exact]
      : notes.filter((note) => note.category === path);
    if (local.length === 0) lines.push("", "_No Notes recorded._");
    for (const note of local) {
      const successors = notes.filter(
        ({ supersedes }) => supersedes === note.address,
      );
      lines.push("", header(note, successors), "", note.content);
    }
  }
  return {
    status: "compiled",
    revision,
    scope: exact?.address ?? options.address ?? null,
    markdown: `${lines.join("\n")}\n`,
  };
};
