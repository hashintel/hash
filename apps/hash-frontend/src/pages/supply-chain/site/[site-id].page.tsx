import { useRouter } from "next/router";

import { useRegistry } from "../../../vct/supply-chain/shared/registry-context";
import { SiteOverview } from "../../../vct/supply-chain/site";
import { getSupplyChainLayout } from "../shared/supply-chain-layout";

import type { NextPageWithLayout } from "../../../shared/layout";

const SitePage: NextPageWithLayout = () => {
  const router = useRouter();
  const { products, sites } = useRegistry();
  const siteId =
    typeof router.query["site-id"] === "string"
      ? router.query["site-id"]
      : (sites[0]?.slug ?? "");

  return <SiteOverview products={products} siteId={siteId} />;
};

SitePage.getLayout = getSupplyChainLayout;

export default SitePage;
