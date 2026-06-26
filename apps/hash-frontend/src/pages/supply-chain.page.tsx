import { useRouter } from "next/router";
import { useEffect } from "react";

import { useRegistry } from "./supply-chain.page/shared/registry-contextry-context";
import { getSupplyChainLayout } from "./supply-chain.page/shared/supply-chain-layoutupply-chain-layout";

import type { NextPageWithLayout } from "../shared/layout";

/** Supply-chain landing: send to the first product. */
const SupplyChainIndexPage: NextPageWithLayout = () => {
  const router = useRouter();
  const { products } = useRegistry();

  useEffect(() => {
    const firstProduct = products[0];
    if (!firstProduct) {
      return;
    }
    void router.replace(`/supply-chain/product/${firstProduct.id}`);
  }, [products, router]);

  return null;
};

SupplyChainIndexPage.getLayout = getSupplyChainLayout;

export default SupplyChainIndexPage;
