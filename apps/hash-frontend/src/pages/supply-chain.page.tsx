import { useRouter } from "next/router";
import { useEffect } from "react";

import { useRegistry } from "./supply-chain/shared/registry-context";
import { getSupplyChainLayout } from "./supply-chain/shared/supply-chain-layout";

import type { NextPageWithLayout } from "../shared/layout";

/** Supply-chain landing: send to the first site, falling back to a product. */
const SupplyChainIndexPage: NextPageWithLayout = () => {
  const router = useRouter();
  const { products, sites } = useRegistry();

  useEffect(() => {
    const firstSite = sites[0];
    if (firstSite) {
      void router.replace(`/supply-chain/site/${firstSite.slug}`);
      return;
    }

    const firstProduct = products[0];
    if (!firstProduct) {
      return;
    }
    void router.replace(`/supply-chain/product/${firstProduct.id}`);
  }, [products, router, sites]);

  return null;
};

SupplyChainIndexPage.getLayout = getSupplyChainLayout;

export default SupplyChainIndexPage;
