/**
 * Stable identity for a site node / table row: the node id plus its product-id
 * set (a node can appear once per product grouping). Used for React keys and
 * for matching current rows to their historical counterparts.
 */
export function siteNodeKey(node: {
  id: string;
  products: { id: string }[];
}): string {
  return `${node.id}-${node.products.map((product) => product.id).join(",")}`;
}
