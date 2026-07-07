import { NextSeo } from "next-seo";
import { useRouter } from "next/router";
import { useEffect } from "react";

import { useRegistry } from "../shared/registry-context";
import { normaliseSiteCode } from "../shared/site-code";
import { getSupplyChainLayout } from "../shared/supply-chain-layout";
import { trackSupplyChainViewed } from "../shared/telemetry";
import { SiteOverview } from "../supply-chain-data-shell/site";
import { useSupplyChainStatusState } from "../supply-chain-data-shell/site/use-supply-chain-status-state";

import type { NextPageWithLayout } from "../../../shared/layout";

const SitePage: NextPageWithLayout = () => {
  const router = useRouter();
  const { products, sites } = useRegistry();
  const siteId = normaliseSiteCode(
    typeof router.query["site-id"] === "string"
      ? router.query["site-id"]
      : (sites[0]?.slug ?? ""),
  );
  const opportunityStatusStore = useSupplyChainStatusState(siteId);

  const siteName = sites.find(
    (site) => normaliseSiteCode(site.slug) === siteId,
  )?.name;

  useEffect(() => {
    if (!siteId) {
      return;
    }

    trackSupplyChainViewed({
      route: "/supply-chain/site/[site-id]",
      siteId,
      source: "site_page",
    });
  }, [siteId]);

  return (
    <>
      <NextSeo title={siteName ?? "Site"} />
      <SiteOverview
        key={siteId}
        products={products}
        siteId={siteId}
        opportunityStatusHistory={opportunityStatusStore.statusHistory}
        opportunityStatusActions={opportunityStatusStore.actions}
      />
    </>
  );
};

SitePage.getLayout = getSupplyChainLayout;

export default SitePage;
