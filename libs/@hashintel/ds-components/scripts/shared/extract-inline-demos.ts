/**
 * Locates the inline demo components a docs MDX page defines at module level
 * so the publish pipeline can move them into a generated client module
 * (`docs/demos/<slug>.gen.tsx`): under React Server Components the MDX module
 * compiles as a server module, where hooks and inline functions are illegal,
 * so everything component-shaped must live in an importable client module.
 * Storybook keeps rendering the inline originals.
 *
 * An export moves when it is component-shaped (uppercase name, arrow value),
 * together with any other module-level exports its body references (demo
 * helpers, option arrays, …). `meta` never moves. Used by
 * `generate-docs-demos.ts` (writes the generated module) and
 * `generate-docs-mdx.ts` (removes the blocks from the published page and
 * imports the moved names back).
 */

export interface ExportBlock {
  name: string;
  /** Inclusive start / exclusive end line indexes of the export statement. */
  startLine: number;
  endLine: number;
  text: string;
}

export interface InlineDemoExtraction {
  /** Blocks to move, in source order. */
  moved: ExportBlock[];
  movedNames: string[];
  /** Header import statements (verbatim lines), excluding Storybook's. */
  headerImports: string[];
  /** Named imports from "react" in the header, e.g. ["Fragment", "useState"]. */
  reactImportNames: string[];
}

const exportStart = /^export const (\w+) = /;
const blockEnd = /^(\};|\);|\];)$/;

/** Names importable from react that are legal in a server-compiled module. */
export const serverSafeReactNames = new Set(["Fragment"]);

/**
 * Scans module-level export statements, tracking code fences and template
 * literals so that example code *inside* them (which freely contains
 * `export const …` display text) is never mistaken for a real export.
 */
const findExportBlocks = (lines: string[]): ExportBlock[] => {
  const blocks: ExportBlock[] = [];
  let inFence = false;
  let backtickParity = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      continue;
    }
    const startedInTemplate = backtickParity % 2 === 1;
    backtickParity += (line.match(/`/g) ?? []).length;
    if (startedInTemplate) {
      continue;
    }
    const match = exportStart.exec(line);
    if (!match || match[1] === undefined) {
      continue;
    }
    const name = match[1];
    let end = index;
    // Single-line export (`export const x = "y";`) unless the line opens a
    // multi-line construct — including a template literal whose first display
    // line happens to end with `;` (odd backtick count = still open).
    if (
      !/;\s*$/.test(line) ||
      /[({[`]\s*$/.test(line) ||
      (line.match(/`/g) ?? []).length % 2 === 1
    ) {
      end = index + 1;
      while (end < lines.length) {
        const candidate = lines[end] ?? "";
        const candidateInTemplate = backtickParity % 2 === 1;
        backtickParity += (candidate.match(/`/g) ?? []).length;
        const closesTemplateConst =
          candidateInTemplate &&
          backtickParity % 2 === 0 &&
          /`;\s*$/.test(candidate);
        if (
          (!candidateInTemplate && blockEnd.test(candidate)) ||
          closesTemplateConst
        ) {
          break;
        }
        end += 1;
      }
      if (end === lines.length) {
        throw new Error(`unterminated export block for \`${name}\``);
      }
    }
    blocks.push({
      name,
      startLine: index,
      endLine: end + 1,
      text: lines.slice(index, end + 1).join("\n"),
    });
    index = end;
  }
  return blocks;
};

export const extractInlineDemos = (source: string): InlineDemoExtraction => {
  const lines = source.split("\n");
  const metaLine = lines.findIndex((line) => line.startsWith("<Meta "));
  const headerLines = metaLine === -1 ? [] : lines.slice(0, metaLine);

  const headerImports: string[] = [];
  let reactImportNames: string[] = [];
  for (let index = 0; index < headerLines.length; index += 1) {
    const line = headerLines[index] ?? "";
    if (!line.startsWith("import ")) {
      continue;
    }
    let statement = line;
    while (!statement.includes('";') && index + 1 < headerLines.length) {
      index += 1;
      statement += `\n${headerLines[index] ?? ""}`;
    }
    if (statement.includes('"@storybook/addon-docs/blocks"')) {
      continue;
    }
    if (statement.includes('"react"')) {
      reactImportNames =
        /\{ ([^}]+) \}/
          .exec(statement)?.[1]
          ?.split(",")
          .map((name) => name.trim()) ?? [];
    }
    headerImports.push(statement);
  }

  // Every module-level export moves except `meta` (page front-matter, read
  // by the publish pipeline and referenced by page bodies). Blanket moving —
  // rather than just the component-shaped exports — keeps functions nested in
  // data exports (e.g. async `items` loaders in filter option arrays) out of
  // the server-compiled page too.
  const blocks = findExportBlocks(lines);
  const moved = new Map<string, ExportBlock>();
  for (const block of blocks) {
    if (block.name !== "meta") {
      moved.set(block.name, block);
    }
  }

  const movedBlocks = [...moved.values()].sort(
    (a, b) => a.startLine - b.startLine,
  );
  return {
    moved: movedBlocks,
    movedNames: movedBlocks.map((block) => block.name),
    headerImports,
    reactImportNames,
  };
};
