/**
 * How map nodes and docs pages name each other: a layer's page sits at its
 * dotted id as a path, an interface's under `interfaces/`, and a page below
 * a layer's belongs to that layer.
 */

import { isInterfaceId, type GraphIndex } from "./graph";

const architecturePrefix = "architecture/";

/** The slug of the page about a node, or null for a node that has none. */
export const pageSlugOf = (id: string): string | null => {
  if (isInterfaceId(id)) {
    return `${architecturePrefix}interfaces/${id.slice("iface:".length)}`;
  }
  if (id.includes(":")) {
    return null;
  }
  return `${architecturePrefix}${id.replace(/\./gu, "/")}`;
};

/** The node a page is about, or the nearest layer above it, or null. */
export const nodeOfSlug = (index: GraphIndex, slug: string): string | null => {
  if (!slug.startsWith(architecturePrefix)) {
    return null;
  }
  const path = slug.slice(architecturePrefix.length);
  if (path.startsWith("interfaces/")) {
    const id = `iface:${path.slice("interfaces/".length)}`;
    return index.interfaces.has(id) ? id : null;
  }
  const segments = path.split("/");
  for (let length = segments.length; length >= 1; length -= 1) {
    const id = segments.slice(0, length).join(".");
    if (index.layers.has(id)) {
      return id;
    }
  }
  return null;
};
