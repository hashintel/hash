/**
 * What every generated page is made of: the record the bundle carries, the
 * band generated pages sort into, and the Markdown helpers the builders
 * share.
 */

export interface GeneratedPage {
  /** Path within the bundle, e.g. `pages/core.simulation.mdx`. */
  path: string;
  /** Route-ish identifier a host can map onto its own URL space. */
  slug: string;
  title: string;
  description: string;
  contents: string;
  order: number;
}

/**
 * Sidebar order at which generated pages begin.
 *
 * Authored pages are the narrative entry to the docs and generated pages are
 * reference, so the two sets are kept in separate bands rather than interleaved
 * by number. An authored page can still sort itself after the reference section
 * by choosing a `sidebar_order` above this.
 */
export const GENERATED_ORDER_BASE = 1000;

/**
 * Backslashes are escaped before pipes, not after.
 *
 * Escaping only the pipe turns a role containing `a\|b` into `a\\|b`, which
 * Markdown reads as a literal backslash followed by an unescaped cell
 * separator, splitting the row. Roles are prose written by hand, so this is
 * reachable by anyone who writes one.
 */
export const escapeTableCell = (text: string): string =>
  text.replace(/\\/gu, "\\\\").replace(/\|/gu, "\\|").replace(/\n/gu, " ");

/** Serialises frontmatter by hand so the output stays byte-stable. */
export const frontmatter = (
  fields: Record<string, string | number>,
): string => {
  const lines = Object.entries(fields).map(
    ([key, value]) =>
      `${key}: ${typeof value === "number" ? value : JSON.stringify(value)}`,
  );
  return ["---", ...lines, "---", ""].join("\n");
};

export const sourceLink = (sourceUrlPrefix: string, file: string): string =>
  `${sourceUrlPrefix}${file}`;

/** The slug a layer's generated page occupies. */
