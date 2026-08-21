import { describe, expect, it } from "vitest";

import { statusKey } from "../../shared/status";
import { resolveStatusRoute } from "./status-route";

import type { SiteNode } from "../../shared/types";

const siteNode = ({
  id,
  productId = "product-1",
}: {
  id: string;
  productId?: string;
}): SiteNode =>
  ({
    id,
    type: "production",
    products: [{ id: productId, name: "Product" }],
  }) as SiteNode;

describe("resolveStatusRoute", () => {
  it("resolves a scope key against unfiltered historical nodes", () => {
    const hiddenByCurrentFilters = siteNode({ id: "production-step" });

    expect(
      resolveStatusRoute(
        "site-a",
        statusKey("site-a", hiddenByCurrentFilters),
        [hiddenByCurrentFilters],
      ),
    ).toEqual({
      node: hiddenByCurrentFilters,
      productId: "product-1",
    });
  });

  it("does not resolve a key from another site or an unusable node", () => {
    const node = siteNode({ id: "production-step" });
    const nodeWithoutProducts = {
      ...node,
      products: [],
    };

    expect(
      resolveStatusRoute("site-b", statusKey("site-a", node), [node]),
    ).toBeNull();
    expect(
      resolveStatusRoute("site-a", statusKey("site-a", nodeWithoutProducts), [
        nodeWithoutProducts,
      ]),
    ).toBeNull();
  });
});
