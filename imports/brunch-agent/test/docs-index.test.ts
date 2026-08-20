/**
 * Documentation coverage, as tests rather than as a habit.
 *
 * `docs/agents/documentation.md` states the placement rules as obligations —
 * every document is indexed, living cross-effort docs go in
 * `docs/planning/_shared/`, agent protocols are reachable from `AGENTS.md`. An
 * obligation nobody can run is a wish, and this one decays in the quietest way
 * available: a file lands, the INDEX pass is skipped once, and nothing ever says
 * so. These are the mechanical checks — they walk the real `docs/` tree, so a
 * document added later is governed without opting in.
 *
 * Both directions matter. A row that no longer points at anything is the same
 * failure as an unindexed file, one step further along: the index has stopped
 * describing the tree it governs, and reading it now misinforms.
 */

import { describe, expect, test } from 'bun:test';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { REPO_ROOT } from './workspace.ts';

const DOCS_ROOT = join(REPO_ROOT, 'docs');
const INDEX_RELPATH = 'INDEX.md';

/** Gitignored ephemera — in the tree but not of it, so never indexed. */
const SKIP_DIRECTORIES = ['drafts'];
/** Filesystem and placeholder artefacts: not documents. */
const SKIP_FILES = ['.DS_Store', '.gitkeep'];
/**
 * `docs/agents/` is deliberately outside the INDEX's remit: those files are
 * pointed at from `AGENTS.md`, which is the pointer an agent actually reads, and
 * the third rule below governs them there. Listing them twice would let the two
 * registries disagree about what the protocol set is.
 */
const INDEX_EXEMPT = ['agents', INDEX_RELPATH];

/** Posix-shaped, because that is how a markdown link target is written. */
const relPath = (path: string): string => relative(DOCS_ROOT, path).replaceAll('\\', '/');

/**
 * Every documentation file `docs/INDEX.md` is answerable for, relative to
 * `docs/`.
 *
 * Enumerated live rather than snapshotted. A recorded list would go green on the
 * day someone forgot to update it — the failure mode this file exists to catch,
 * reproduced inside the check meant to catch it.
 */
function documentationFiles(): string[] {
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir).sort()) {
      if (SKIP_DIRECTORIES.includes(entry) || SKIP_FILES.includes(entry)) continue;
      const path = join(dir, entry);
      const rel = relPath(path);
      if (INDEX_EXEMPT.includes(rel)) continue;
      if (statSync(path).isDirectory()) walk(path);
      else found.push(rel);
    }
  };
  walk(DOCS_ROOT);
  return found;
}

const FILES = documentationFiles();

interface IndexRow {
  /** 1-based line in `docs/INDEX.md`, so a failure names where to look. */
  readonly line: number;
  /** Link target, decoded and relative to `docs/`. May name a file or a directory. */
  readonly target: string;
}

const MARKDOWN_LINK = /\[[^\]]*\]\(([^)]+)\)/g;

/**
 * The document rows of `docs/INDEX.md` — the first cell of each table row.
 *
 * Only the first cell, because that is the column that claims to identify a
 * document; a Digest cell may legitimately link out to a Notion page or a
 * superseding source without claiming anything lives at that path. Cells are
 * split on a bare `|`, which is exact for this file and would need revisiting
 * only for an escaped `\|` or a pipe inside inline code.
 */
function indexRows(): IndexRow[] {
  const rows: IndexRow[] = [];
  const lines = readFileSync(join(DOCS_ROOT, INDEX_RELPATH), 'utf8').split('\n');
  for (const [offset, line] of lines.entries()) {
    const trimmed = line.trimStart();
    if (!trimmed.startsWith('|')) continue;
    const firstCell = trimmed.split('|')[1] ?? '';
    for (const match of firstCell.matchAll(MARKDOWN_LINK)) {
      const raw = match[1]!.trim();
      // `external`-status rows point at the canonical copy outside the repo, and
      // a bare anchor points within this file. Neither makes a claim about disk.
      if (/^https?:\/\//.test(raw) || raw.startsWith('#')) continue;
      const path = raw.split('#')[0]!;
      // One filename contains a space, so targets are percent-encoded in the
      // markdown and must be decoded before they name anything on disk.
      rows.push({ line: offset + 1, target: decodeURIComponent(path) });
    }
  }
  return rows;
}

const ROWS = indexRows();

/**
 * Whether a row's target accounts for a file. A target naming a directory covers
 * everything beneath it: the INDEX deliberately indexes some sets as a set — the
 * thirteen resolved issue files, the baseline experiment's transcripts — because
 * one digest describes them better than thirteen would.
 */
const covers = (target: string, file: string): boolean => {
  const base = target.replace(/\/$/, '');
  return file === base || file.startsWith(`${base}/`);
};

describe('every document is in the index, and the index is all documents', () => {
  test('the walk actually finds documents', () => {
    // Without this, a `docs/` the walker cannot read makes the coverage check
    // below iterate an empty list and pass vacuously — a silent exemption for
    // the entire tree, which is worse than having no gate.
    expect(FILES.length).toBeGreaterThan(0);
    expect(ROWS.length).toBeGreaterThan(0);
  });

  test('every file under docs/ is covered by a row in docs/INDEX.md', () => {
    for (const file of FILES) {
      expect({ file, indexed: ROWS.some((row) => covers(row.target, file)) }).toEqual({
        file,
        indexed: true,
      });
    }
  });

  test('every row in docs/INDEX.md points at something real', () => {
    // A row standing for nothing is not tidiness: the index is what a reader
    // consults instead of walking the tree, so a stale row is misinformation
    // with the authority of a registry behind it.
    for (const row of ROWS) {
      const path = join(DOCS_ROOT, row.target.replace(/\/$/, ''));
      const resolves =
        existsSync(path) &&
        (statSync(path).isDirectory() ? FILES.some((file) => covers(row.target, file)) : true);
      expect({ line: row.line, target: row.target, resolves }).toEqual({
        line: row.line,
        target: row.target,
        resolves: true,
      });
    }
  });
});

test('docs/planning/ holds only effort directories', () => {
  // Placement rule: a cross-effort living document goes in `_shared/`, and a
  // record of one effort goes in that effort's directory. A file loose at the
  // top level is the state both of those replaced — it belongs to everything and
  // so to nothing, and it is where the last round of drift accumulated.
  const planning = join(DOCS_ROOT, 'planning');
  const loose = readdirSync(planning)
    .filter((entry) => !SKIP_FILES.includes(entry))
    .filter((entry) => !statSync(join(planning, entry)).isDirectory())
    .sort();
  expect(loose).toEqual([]);
});

describe('every agent protocol doc is reachable from AGENTS.md', () => {
  // `AGENTS.md` is the file an agent is given; a protocol it does not name is a
  // protocol that will not be followed, however well written. The pointer form
  // is established — the path in prose or backticks — so a substring check on
  // the path is exactly as strict as the convention is.
  const agentsText = readFileSync(join(REPO_ROOT, 'AGENTS.md'), 'utf8');
  const protocols = readdirSync(join(DOCS_ROOT, 'agents'))
    .filter((entry) => entry.endsWith('.md'))
    .sort();

  test('there are protocol docs to govern', () => {
    expect(protocols.length).toBeGreaterThan(0);
  });

  test('AGENTS.md names each one by path', () => {
    for (const protocol of protocols) {
      const path = `docs/agents/${protocol}`;
      expect({ path, namedInAgentsMd: agentsText.includes(path) }).toEqual({
        path,
        namedInAgentsMd: true,
      });
    }
  });
});
