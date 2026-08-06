/**
 * The in-code tag vocabulary, and the scanner that reads it.
 *
 * A layer is declared either here, with `@layerRoot` on a folder's primary
 * file, or in a folder `README.md`'s frontmatter (see `frontmatter.ts`), whose
 * prose then becomes the layer's page. Other tags refine a layer with facts
 * belonging to specific code. Files with no tags inherit from the nearest
 * declaring ancestor.
 *
 * Tags are recognised only at the start of a line inside a block comment, so a
 * tag named in prose or in a string literal is not picked up.
 */

import { boundaryKindSchema, type BoundaryKind } from "./model";

/** A tag occurrence, with the line it was found on for error reporting. */
export interface TagValue {
  value: string;
  line: number;
}

export interface BoundaryTag {
  kind: BoundaryKind;
  note: string;
  line: number;
}

export interface ParsedTags {
  /**
   * `@layerRoot` — declares that this file's folder *and its descendants* form
   * the named layer. The alternative to a README declaration, for folders that
   * have a barrel entry file but no README.
   */
  layerRoot: TagValue | null;
  /**
   * `@layer` — assigns this single file to an already-declared layer,
   * overriding what it would inherit. Use sparingly: a file that needs this is
   * often a file in the wrong folder.
   */
  layer: TagValue | null;
  layerName: TagValue | null;
  role: TagValue | null;
  owner: TagValue | null;
  entryPoints: TagValue[];
  boundaries: BoundaryTag[];
  invariants: TagValue[];
}

export interface TagDiagnostic {
  line: number;
  message: string;
}

export interface TagScanResult {
  tags: ParsedTags;
  diagnostics: TagDiagnostic[];
  /** True when the file carried at least one architecture tag. */
  annotated: boolean;
}

const emptyTags = (): ParsedTags => ({
  layerRoot: null,
  layer: null,
  layerName: null,
  role: null,
  owner: null,
  entryPoints: [],
  boundaries: [],
  invariants: [],
});

/** Tags that may appear at most once per file. */
const singularTags = [
  "layerRoot",
  "layer",
  "layerName",
  "role",
  "owner",
] as const;

type SingularTag = (typeof singularTags)[number];

const repeatableTags = ["entryPoint", "boundary", "invariant"] as const;

const knownTagNames = new Set<string>([...singularTags, ...repeatableTags]);

/**
 * Tag names that look like ours but are not, so a typo produces a diagnostic
 * instead of being silently ignored. Anything not in `knownTagNames` and not
 * a standard JSDoc tag is reported.
 */
const ignoredTagNames = new Set([
  "param",
  "returns",
  "return",
  "throws",
  "example",
  "see",
  "link",
  "deprecated",
  "internal",
  "public",
  "private",
  "protected",
  "readonly",
  "typeParam",
  "template",
  "type",
  "typedef",
  "default",
  "remarks",
  "module",
  "packageDocumentation",
  "since",
  "todo",
  "fileoverview",
  "file",
  "overload",
  "satisfies",
  "experimental",
  "alpha",
  "beta",
  "eslint",
  "vitest",
  "vi",
]);

const blockCommentPattern = /\/\*\*[\s\S]*?\*\//gu;

/**
 * Splits `@boundary worker — frames never cross` into kind and note. The
 * separator may be an em dash, a hyphen or a colon; all three read naturally in
 * a comment and all three are common in this codebase.
 */
const boundarySeparator = /\s*(?:—|--|-|:)\s*/u;

/**
 * Byte offsets of the start of each line, so an offset can be turned into a
 * 1-based line number by binary search rather than a rescan per comment.
 */
const lineStartOffsets = (text: string): number[] => {
  const starts = [0];
  for (let position = 0; position < text.length; position += 1) {
    if (text[position] === "\n") {
      starts.push(position + 1);
    }
  }
  return starts;
};

const lineNumberAt = (lineStarts: number[], offset: number): number => {
  let low = 0;
  let high = lineStarts.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if ((lineStarts[middle] ?? 0) <= offset) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }
  return low + 1;
};

/**
 * Strips the comment delimiters and the leading `*` gutter, returning body
 * lines paired with their line number in the original file.
 */
const commentBodyLines = (
  comment: string,
  startLine: number,
): { text: string; line: number }[] =>
  comment
    .replace(/^\/\*\*/u, "")
    .replace(/\*\/$/u, "")
    .split("\n")
    .map((rawLine, offset) => ({
      text: rawLine.replace(/^\s*\*\s?/u, ""),
      line: startLine + offset,
    }));

interface RawTag {
  name: string;
  text: string;
  line: number;
}

/**
 * Collects tags from one comment body. A tag's text continues onto following
 * lines until the next tag or the end of the comment, so multi-line notes stay
 * readable in source.
 */
const collectRawTags = (lines: { text: string; line: number }[]): RawTag[] => {
  const tags: RawTag[] = [];
  let current: RawTag | null = null;

  for (const { text, line } of lines) {
    const match = /^@([A-Za-z][A-Za-z0-9]*)\s*(.*)$/u.exec(text.trim());

    if (match) {
      if (current) {
        tags.push(current);
      }
      current = { name: match[1] ?? "", text: match[2] ?? "", line };
      continue;
    }

    if (current) {
      const continuation = text.trim();
      if (continuation === "") {
        // A blank line ends the tag's text but not the comment.
        tags.push(current);
        current = null;
      } else {
        current.text = `${current.text} ${continuation}`.trim();
      }
    }
  }

  if (current) {
    tags.push(current);
  }

  return tags;
};

/** Reads every architecture tag out of a source file's block comments. */
export const scanTags = (sourceText: string): TagScanResult => {
  const tags = emptyTags();
  const diagnostics: TagDiagnostic[] = [];
  let annotated = false;

  const assignSingular = (name: SingularTag, { text, line }: RawTag): void => {
    if (text === "") {
      diagnostics.push({ line, message: `@${name} requires a value` });
      return;
    }
    if (tags[name] !== null) {
      diagnostics.push({
        line,
        message: `duplicate @${name} (already set on line ${tags[name]?.line})`,
      });
      return;
    }
    tags[name] = { value: text, line };
    annotated = true;
  };

  const lineStarts = lineStartOffsets(sourceText);

  for (const match of sourceText.matchAll(blockCommentPattern)) {
    if (match.index !== 0) { continue; }
    const startLine = lineNumberAt(lineStarts, match.index);
    const rawTags = collectRawTags(commentBodyLines(match[0], startLine));

    for (const rawTag of rawTags) {
      const { name, text, line } = rawTag;

      if (singularTags.includes(name as SingularTag)) {
        assignSingular(name as SingularTag, rawTag);
        continue;
      }

      if (name === "entryPoint") {
        if (text === "") {
          diagnostics.push({
            line,
            message: "@entryPoint requires an import specifier",
          });
          continue;
        }
        tags.entryPoints.push({ value: text, line });
        annotated = true;
        continue;
      }

      if (name === "invariant") {
        if (text === "") {
          diagnostics.push({
            line,
            message: "@invariant requires a description",
          });
          continue;
        }
        tags.invariants.push({ value: text, line });
        annotated = true;
        continue;
      }

      if (name === "boundary") {
        const [rawKind = "", ...noteParts] = text.split(boundarySeparator);
        const parsedKind = boundaryKindSchema.safeParse(rawKind.trim());

        if (!parsedKind.success) {
          diagnostics.push({
            line,
            message: `unknown @boundary kind ${JSON.stringify(rawKind.trim())}; expected one of ${boundaryKindSchema.options.join(", ")}`,
          });
          continue;
        }

        const note = noteParts.join(" ").trim();
        if (note === "") {
          diagnostics.push({
            line,
            message: `@boundary ${parsedKind.data} needs a note explaining what may not cross it`,
          });
          continue;
        }

        tags.boundaries.push({ kind: parsedKind.data, note, line });
        annotated = true;
        continue;
      }

      if (!knownTagNames.has(name) && !ignoredTagNames.has(name)) {
        const lowered = name.toLowerCase();
        const suggestion = [...knownTagNames].find(
          (known) => known.toLowerCase() === lowered,
        );
        if (suggestion) {
          diagnostics.push({
            line,
            message: `unknown tag @${name}; did you mean @${suggestion}?`,
          });
        }
      }
    }
  }

  return { tags, diagnostics, annotated };
};
