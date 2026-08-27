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
 * Normalization runs on blocks that were already split from the raw page, so
 * statuses computed on normalized blocks map back to the raw ones by index.
 */

/**
 * What is deliberately ignored, and why:
 *
 * - `sidebar_order` — index-based, so an inserted layer shifts every page
 *   after it.
 * - `files={N}` / `lines={N}` — code volume, not architecture. A layer whose
 *   file *membership* changed is flagged separately from the model.
 * - `"imports":N` in relation entries — edge weight. The edge appearing or
 *   disappearing still counts; its count drifting does not.
 * - the `dependedOnBy` list — an incoming edge is the importing layer's
 *   change, and it is flagged there, on the `dependsOn` side.
 * - the file-count column of the overview's layer table — same reason as
 *   `files={N}`.
 */
const masks: [RegExp, string][] = [
  [/^sidebar_order: \d+$/gmu, "sidebar_order: 0"],
  [/\b(files|lines)=\{\d+\}/gu, "$1={0}"],
  [/"imports":\d+/gu, '"imports":0'],
  // Collapsed to the same form the emitter uses for an empty list, so a layer
  // gaining its first dependent (or losing its last) is masked like any other.
  [/^ {2}dependedOnBy=\{\[\n(?: {4}.*\n)+? {2}\]\}$/gmu, "  dependedOnBy={[]}"],
  [/^(\| \[.*) \| \d+ \|$/gmu, "$1 | 0 |"],
];

/**
 * The normalized form of one generated block (or frontmatter). Authored pages
 * are compared verbatim — they carry no derived facts to mask.
 */
export const normalizeGeneratedBlock = (block: string): string =>
  masks.reduce(
    (text, [pattern, replacement]) => text.replace(pattern, replacement),
    block,
  );
