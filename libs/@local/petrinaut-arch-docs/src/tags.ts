/**
 * The in-code tag vocabulary, and the scanner that reads it.
 *
 * A layer is declared either here, with `@layerRoot` on a folder's primary
 * file, or in a folder `README.md`'s frontmatter (see `frontmatter.ts`), whose
 * prose then becomes the layer's page. Files with no tags inherit from the
 * nearest declaring ancestor.
 *
 * The vocabulary is deliberately two tags: an id and a one-line role. Both are
 * needed to place a layer in the graph and to label it — anything more is a
 * claim the generator cannot check, and this version does not make claims it
 * cannot keep. Other tags (`@boundary`, `@invariant`, `@entryPoint`) remain
 * written in the Petrinaut source and are simply not read; re-registering one
 * here is all it would take to surface them again.
 *
 * Tags are recognised only at the start of a line inside a block comment, so a
 * tag named in prose or in a string literal is not picked up.
 */

/** A tag occurrence, with the line it was found on for error reporting. */
export interface TagValue {
  value: string;
  line: number;
}

export interface ParsedTags {
  /**
   * `@layerRoot` — declares that this file's folder *and its descendants* form
   * the named layer. The alternative to a README declaration, for folders that
   * have a barrel entry file but no README.
   */
  layerRoot: TagValue | null;
  /** `@role` — one-line statement of what the layer is responsible for. */
  role: TagValue | null;
}

export interface TagDiagnostic {
  line: number;
  message: string;
}

export interface TagScanResult {
  tags: ParsedTags;
  diagnostics: TagDiagnostic[];
}

const emptyTags = (): ParsedTags => ({
  layerRoot: null,
  role: null,
});

/** Tags that may appear at most once per file. */
const singularTags = ["layerRoot", "role"] as const;

type SingularTag = (typeof singularTags)[number];

const knownTagNames = new Set<string>(singularTags);

const blockCommentPattern = /\/\*\*[\s\S]*?\*\//gu;

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
  };

  const lineStarts = lineStartOffsets(sourceText);

  for (const match of sourceText.matchAll(blockCommentPattern)) {
    const startLine = lineNumberAt(lineStarts, match.index);
    const rawTags = collectRawTags(commentBodyLines(match[0], startLine));

    for (const rawTag of rawTags) {
      const { name, line } = rawTag;

      if (singularTags.includes(name as SingularTag)) {
        assignSingular(name as SingularTag, rawTag);
        continue;
      }

      // Only a miscased version of one of our own tags is reported. Every other
      // unknown tag is someone else's — `@param`, `@deprecated`, an eslint
      // directive, or one of the annotations this version deliberately does not
      // read — and is none of our business.
      const suggestion = [...knownTagNames].find(
        (known) => known !== name && known.toLowerCase() === name.toLowerCase(),
      );
      if (suggestion !== undefined) {
        diagnostics.push({
          line,
          message: `unknown tag @${name}; did you mean @${suggestion}?`,
        });
      }
    }
  }

  return { tags, diagnostics };
};
