/**
 * The in-code tag vocabulary, and the scanner that reads it.
 *
 * A layer is declared either here, with `@layerRoot` on a folder's primary
 * file, or in a folder `README.md`'s frontmatter (see `frontmatter.ts`), whose
 * prose then becomes the layer's page. Files with no tags inherit from the
 * nearest declaring ancestor.
 *
 * The vocabulary is three tags. `@layerRoot` and `@role` place a layer in the
 * graph and label it. `@talksTo` declares an edge no import produces, such as a
 * spawned subprocess or a postMessage channel; anything more is a claim the
 * generator cannot check, and this version does not make claims it cannot keep.
 *
 * Tags are recognised only at the start of a line inside a doc comment — a
 * `/** ... *​/` block in TypeScript, a triple-quoted docstring in Python — so a
 * tag named in running prose is not picked up. Python `#` comments are
 * deliberately not scanned: a layer declaration belongs in the module
 * docstring, where the module already describes itself.
 *
 * Comments are matched by pattern rather than by lexing the file, so a string
 * or template literal containing a whole comment block would be read as one.
 * Using a real parser would remove that case, at the cost of parsing every
 * file. Worth revisiting if a package starts embedding annotated code samples
 * in string literals.
 */

/** A tag occurrence, with the line it was found on for error reporting. */
export interface TagValue {
  value: string;
  line: number;
}

/** One `@talksTo` occurrence: a dependency on `target` over `protocol`. */
export interface TalksToTag {
  /** Layer id on the receiving end of the protocol. */
  target: string;
  /** The text after `via`, e.g. "JSON lines over stdio". */
  protocol: string;
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
  /**
   * `@talksTo <layer-id> via <protocol>` — declares a dependency no import
   * produces, such as a spawned subprocess or a postMessage channel. The
   * declaring file's own layer is the edge source. Repeatable.
   */
  talksTo: TalksToTag[];
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
  talksTo: [],
});

/** Tags that may appear at most once per file. */
const singularTags = ["layerRoot", "role"] as const;

type SingularTag = (typeof singularTags)[number];

const knownTagNames = new Set<string>([...singularTags, "talksTo"]);

/**
 * `<layer-id> via <protocol>`: the id grammar matches `layerSchema` in
 * `model.ts`, and the protocol is required free text.
 */
const talksToPattern =
  /^([a-z0-9]+(?:-[a-z0-9]+)*(?:\.[a-z0-9]+(?:-[a-z0-9]+)*)*)\s+via\s+(\S.*)$/u;

/** The language a file's doc comments are written for. */
export type CommentLanguage = "typescript" | "python";

const blockCommentPattern = /\/\*\*[\s\S]*?\*\//gu;

/**
 * The module docstring only: the first statement after blank and `#` lines.
 * A triple-quoted string anywhere else is a value, not an annotation host.
 */
const pythonModuleDocstringPattern =
  /^(?:[ \t]*(?:#[^\r\n]*)?\r?\n)*[ \t]*("""[\s\S]*?"""|'''[\s\S]*?''')/u;

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
 * Strips the comment delimiters and (for JSDoc) the leading `*` gutter,
 * returning body lines paired with their line number in the original file.
 * Python docstrings carry no gutter, so their lines only lose the quotes.
 */
const commentBodyLines = (
  comment: string,
  startLine: number,
  language: CommentLanguage,
): { text: string; line: number }[] => {
  const body =
    language === "python"
      ? comment.replace(/^(?:"""|''')/u, "").replace(/(?:"""|''')$/u, "")
      : comment.replace(/^\/\*\*/u, "").replace(/\*\/$/u, "");

  return body.split("\n").map((rawLine, offset) => ({
    text: language === "python" ? rawLine : rawLine.replace(/^\s*\*\s?/u, ""),
    line: startLine + offset,
  }));
};

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

/** Reads every architecture tag out of a source file's doc comments. */
export const scanTags = (
  sourceText: string,
  language: CommentLanguage = "typescript",
): TagScanResult => {
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

  const comments: { text: string; index: number }[] = [];
  if (language === "python") {
    const match = pythonModuleDocstringPattern.exec(sourceText);
    if (match?.[1] !== undefined) {
      comments.push({
        text: match[1],
        index: match.index + match[0].length - match[1].length,
      });
    }
  } else {
    for (const match of sourceText.matchAll(blockCommentPattern)) {
      comments.push({ text: match[0], index: match.index });
    }
  }

  for (const match of comments) {
    const startLine = lineNumberAt(lineStarts, match.index);
    const rawTags = collectRawTags(
      commentBodyLines(match.text, startLine, language),
    );

    for (const rawTag of rawTags) {
      const { name, line } = rawTag;

      if (singularTags.includes(name as SingularTag)) {
        assignSingular(name as SingularTag, rawTag);
        continue;
      }

      if (name === "talksTo") {
        const parsed = talksToPattern.exec(rawTag.text);
        if (parsed) {
          tags.talksTo.push({
            target: parsed[1] ?? "",
            protocol: (parsed[2] ?? "").trim(),
            line,
          });
        } else {
          diagnostics.push({
            line,
            message:
              "@talksTo expects `@talksTo <layer-id> via <protocol>`, e.g. `@talksTo cli via JSON lines over stdio`",
          });
        }
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
