import { statusKey } from "../../shared/status";

import type { SiteNode } from "../../shared/types";

export interface ResolvedStatusRoute {
  node: SiteNode;
  productId: string;
}

export const resolveStatusRoute = (
  siteId: string,
  scopeKey: string,
  historicalNodes: readonly SiteNode[],
): ResolvedStatusRoute | null => {
  const node = historicalNodes.find(
    (historicalNode) => statusKey(siteId, historicalNode) === scopeKey,
  );
  const productId = node?.products[0]?.id;

  return node && productId ? { node, productId } : null;
};
