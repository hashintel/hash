/**
 * Block-level diffing of page bodies.
 *
 * A "block" is what a reader perceives as one unit on the rendered page: a
 * paragraph, a heading, a table, a fenced code block, one JSX card. Diffing at
 * that granularity is deliberate — a per-word diff of generated MDX would
 * highlight serialization details no reader cares about, while a per-page diff
 * cannot say *where* a page changed.
 */

export type BlockStatus = "unchanged" | "added" | "changed";

export interface BlockDiff {
  /** One status per head block, aligned with the input's head blocks. */
  headStatuses: BlockStatus[];
  /**
   * Base blocks with no head counterpart, keyed by the head block index they
   * precede. A run removed at the end of the page keys `headBlocks.length`.
   */
  removed: Map<number, string[]>;
}

/**
 * Counts JSX element openings a text leaves unclosed.
 *
 * Only capitalised tags count — those are the component elements MDX treats as
 * JSX, and lowercase `<` in prose ("a < b") must not look like markup. Inline
 * code is stripped first so a page *documenting* JSX does not appear to open
 * elements.
 */
const openJsxElements = (text: string): number => {
  const withoutInlineCode = text.replace(/`[^`\n]*`/gu, "");
  const opens = withoutInlineCode.match(/<[A-Z][\w.]*/gu)?.length ?? 0;
  const closes =
    (withoutInlineCode.match(/\/>/gu)?.length ?? 0) +
    (withoutInlineCode.match(/<\/[A-Z][\w.]*>/gu)?.length ?? 0);
  return opens - closes;
};

/**
 * Splits a page body (frontmatter already removed) into blocks.
 *
 * Blocks are blank-line separated, with two exceptions that keep multi-part
 * constructs whole: blank lines inside a fenced code block do not split, and a
 * segment that leaves a JSX element open absorbs the following segments until
 * the element closes. Splitting inside either would let a marker be inserted
 * into the middle of a fence or an element, which fails the consuming site's
 * MDX compile.
 */
export const splitBlocks = (body: string): string[] => {
  const segments: string[] = [];
  let current: string[] = [];
  let insideFence = false;

  const flush = () => {
    if (current.length > 0) {
      segments.push(current.join("\n"));
      current = [];
    }
  };

  for (const line of body.split("\n")) {
    if (/^ {0,3}(?:```|~~~)/u.test(line)) {
      insideFence = !insideFence;
      current.push(line);
      continue;
    }

    if (!insideFence && line.trim() === "") {
      flush();
      continue;
    }

    current.push(line);
  }
  flush();

  const blocks: string[] = [];
  for (const segment of segments) {
    const previous = blocks.at(-1);
    if (previous !== undefined && openJsxElements(previous) > 0) {
      blocks[blocks.length - 1] = `${previous}\n\n${segment}`;
    } else {
      blocks.push(segment);
    }
  }

  return blocks;
};

/** Longest-common-subsequence table over normalized block equality. */
const lcsTable = (base: string[], head: string[]): number[][] => {
  const table: number[][] = Array.from({ length: base.length + 1 }, () =>
    Array.from({ length: head.length + 1 }, () => 0),
  );

  for (let row = base.length - 1; row >= 0; row -= 1) {
    for (let column = head.length - 1; column >= 0; column -= 1) {
      table[row]![column] =
        base[row] === head[column]
          ? table[row + 1]![column + 1]! + 1
          : Math.max(table[row + 1]![column]!, table[row]![column + 1]!);
    }
  }

  return table;
};

/**
 * Diffs two block lists, comparing by their *normalized* forms.
 *
 * `normalize` masks derived noise (counts, orders) before comparison, while
 * statuses stay aligned with the raw head blocks so the caller can annotate
 * the real content. Within a run where the diff both removes and inserts,
 * blocks pair positionally and report as `changed` — a paragraph rewritten in
 * place reads as an edit, not as an unrelated removal plus addition. Excess
 * inserts are `added`, excess removals join `removed`.
 */
export const diffBlocks = (options: {
  baseBlocks: string[];
  headBlocks: string[];
  normalize: (block: string) => string;
}): BlockDiff => {
  const base = options.baseBlocks.map(options.normalize);
  const head = options.headBlocks.map(options.normalize);
  const table = lcsTable(base, head);

  const headStatuses: BlockStatus[] = [];
  const removed = new Map<number, string[]>();

  let baseIndex = 0;
  let headIndex = 0;
  let pendingRemoved: string[] = [];
  let pendingAdded = 0;

  const flushRun = () => {
    const paired = Math.min(pendingRemoved.length, pendingAdded);
    for (let offset = 0; offset < pendingAdded; offset += 1) {
      headStatuses.push(offset < paired ? "changed" : "added");
    }
    const unpaired = pendingRemoved.slice(paired);
    if (unpaired.length > 0) {
      removed.set(headStatuses.length, [
        ...(removed.get(headStatuses.length) ?? []),
        ...unpaired,
      ]);
    }
    pendingRemoved = [];
    pendingAdded = 0;
  };

  while (baseIndex < base.length || headIndex < head.length) {
    if (
      baseIndex < base.length &&
      headIndex < head.length &&
      base[baseIndex] === head[headIndex]
    ) {
      flushRun();
      headStatuses.push("unchanged");
      baseIndex += 1;
      headIndex += 1;
      continue;
    }

    if (
      headIndex < head.length &&
      (baseIndex === base.length ||
        table[baseIndex]![headIndex + 1]! >= table[baseIndex + 1]![headIndex]!)
    ) {
      pendingAdded += 1;
      headIndex += 1;
      continue;
    }

    pendingRemoved.push(options.baseBlocks[baseIndex]!);
    baseIndex += 1;
  }
  flushRun();

  return { headStatuses, removed };
};
