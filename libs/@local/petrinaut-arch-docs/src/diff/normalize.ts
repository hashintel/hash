/**
 * Masks the derived noise in generated pages before diffing.
 *
 * A generated page embeds facts that shift whenever *neighbouring* code moves:
 * import counts, file and line totals, the sidebar position, the list of layers
 * that depend on this one. Diffing raw content would flag every neighbour of a
 * real change — precisely the transitive noise a reviewer opens the diff to
 * avoid. Everything masked here still renders with its current value; it just
 * no longer counts as a difference.
 *
 * Each mask is scoped to the block shape it targets, matched by the block's
 * first line, so authored prose embedded in a page (a declaring README's
 * `## Notes` body) is never rewritten even when it happens to contain
 * `files={12}` or a table row ending in a number.
 *
 * Normalization runs on blocks that were already split from the raw page, so
 * statuses computed on normalized blocks map back to the raw ones by index.
 */

/**
 * Entry lines sorted after their counts are masked: the emitter orders
 * `dependsOn` by import count, so two dependencies swapping rank — with no
 * edge added or removed — would otherwise reorder the lines and defeat the
 * count mask.
 */
const sortRelationEntries = (block: string): string =>
  block.replace(
    /^( {2}dependsOn=\{\[\n)((?: {4}.*\n)+?)( {2}\]\})$/gmu,
    (_, open: string, entries: string, close: string) =>
      `${open}${entries
        .split("\n")
        .filter((line) => line !== "")
        .sort()
        .join("\n")}\n${close}`,
  );

/**
 * The normalized form of one generated block (or frontmatter). Authored pages
 * are compared verbatim — they carry no derived facts to mask.
 *
 * What is deliberately ignored, and why:
 *
 * - `sidebar_order` — index-based, so an inserted layer shifts every page
 *   after it.
 * - `files={N}` / `lines={N}` — code volume, not architecture. A layer whose
 *   file *membership* changed is flagged separately from the model.
 * - `"imports":N` in relation entries, and the count-driven order of the
 *   `dependsOn` list — edge weight. The edge appearing or disappearing still
 *   counts; its count drifting does not.
 * - the `dependedOnBy` list — an incoming edge is the importing layer's
 *   change, and it is flagged there, on the `dependsOn` side. Collapsed to
 *   the same form the emitter uses for an empty list, so a layer gaining its
 *   first dependent (or losing its last) is masked like any other.
 * - the file-count column of the overview's layer table — same reason as
 *   `files={N}`.
 */
export const normalizeGeneratedBlock = (block: string): string => {
  if (block.startsWith("---\n")) {
    return block.replace(/^sidebar_order: \d+$/gmu, "sidebar_order: 0");
  }

  if (block.startsWith("<LayerFacts") || block.startsWith("<LayerSource")) {
    return block.replace(/\b(files|lines)=\{\d+\}/gu, "$1={0}");
  }

  if (block.startsWith("<LayerRelations")) {
    return sortRelationEntries(
      block
        .replace(/"imports":\d+/gu, '"imports":0')
        .replace(
          /^ {2}dependedOnBy=\{\[\n(?: {4}.*\n)+? {2}\]\}$/gmu,
          "  dependedOnBy={[]}",
        ),
    );
  }

  if (block.startsWith("| Layer | Responsibility | Files |")) {
    return block.replace(/^(\| \[.*) \| \d+ \|$/gmu, "$1 | 0 |");
  }

  return block;
};
