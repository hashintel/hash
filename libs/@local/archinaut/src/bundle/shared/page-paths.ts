/**
 * Where a page lives and how one page reaches another or an asset. Slugs
 * are the bundle's URL space; a page links in that space, while an MDX
 * toolchain resolves an image path against the file on disk, so the two
 * relative forms differ on purpose.
 */

import { posix } from "node:path";

export const layerSlug = (id: string): string =>
  `architecture/${id.replace(/\./gu, "/")}`;

/** The slug an interface's generated page occupies: `iface:doc-handle` → `architecture/interfaces/doc-handle`. */
export const interfaceSlug = (id: string): string =>
  `architecture/interfaces/${id.replace(/^iface:/u, "")}`;

/**
 * Relative link from one bundle page to another, so the bundle works when
 * mounted at any base path. Resolved against the slug: page links are
 * followed in URL space, where slugs map to URLs without a trailing slash.
 */
export const relativeTo = (fromSlug: string, toSlug: string): string => {
  const relative = posix.relative(posix.dirname(fromSlug), toSlug);
  return relative === "" ? "." : relative;
};

/**
 * Relative path from a page's *file* to an asset in the bundle.
 *
 * Deliberately different from `relativeTo`: MDX toolchains resolve image paths
 * against the file on disk at build time, not against the page's URL. Using the
 * slug-relative form here produced `diagrams/x.svg` from `pages/architecture.mdx`,
 * which points at a `pages/diagrams/` directory that does not exist.
 */
export const assetPathFrom = (slug: string, assetPath: string): string =>
  posix.relative(posix.dirname(`pages/${slug}`), assetPath);

/**
 * Applies a rewrite to prose only, leaving fenced blocks and inline code spans
 * as written. The pages that document these link schemes show them in examples,
 * and rewriting an example teaches the wrong syntax.
 *
 * Splitting on a capturing pattern puts the code parts at odd indices.
 */
