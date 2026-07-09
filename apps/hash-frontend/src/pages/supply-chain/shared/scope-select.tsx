import { useRouter } from "next/router";
import { useCallback } from "react";

import { useRegistry } from "./registry-context";
import { SearchableSelect } from "./searchable-select";
import { trackSupplyChainInteraction } from "./telemetry";

/**
 * Product/site picker rendered as the page title (display-sized dropdown). Reads
 * the registry + active scope to show the selected label, and navigates on change.
 */
export const ScopeSelect = ({
  productId: productIdProp,
  siteId: siteIdProp,
}: { productId?: string; siteId?: string } = {}) => {
  const router = useRouter();
  const { products, sites } = useRegistry();

  const query = router.query as Record<string, string | undefined>;
  const isSiteScope = router.pathname.startsWith("/supply-chain/site/");
  const productId =
    productIdProp ?? query.productId ?? query["product-id"] ?? "";
  const siteId = siteIdProp ?? query.siteId ?? query["site-id"] ?? "";
  const scopeValue = isSiteScope ? `site:${siteId}` : productId;

  const handleScopeChange = useCallback(
    (val: string) => {
      trackSupplyChainInteraction({
        interaction: "scope_picker_changed",
        source: "scope_select",
      });
      if (val.startsWith("site:")) {
        void router.push(`/supply-chain/site/${val.replace("site:", "")}`);
      } else {
        void router.push(`/supply-chain/product/${val}`);
      }
    },
    [router],
  );

  const scopeGroups = [
    ...(sites.length > 0
      ? [
          {
            label: "Sites",
            options: sites.map((step) => ({
              value: `site:${step.slug}`,
              label: step.name,
            })),
          },
        ]
      : []),
    {
      label: "Products",
      options: products.map((product) => ({
        value: product.id,
        label: product.name,
      })),
    },
  ];

  return (
    <SearchableSelect
      value={scopeValue}
      onChange={handleScopeChange}
      groups={scopeGroups}
      size="lg"
    />
  );
};
