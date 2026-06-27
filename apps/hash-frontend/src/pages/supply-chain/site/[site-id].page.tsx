import { useRouter } from "next/router";
import { useEffect } from "react";

import { SiteOverview } from "../app-shell/site";
import { useSupplyChainStatusState } from "../app-shell/site/use-supply-chain-status-state";
import { useRegistry } from "../shared/registry-context";
import { getSupplyChainLayout } from "../shared/supply-chain-layout";
import { trackSupplyChainViewed } from "../shared/telemetry";

import type { NextPageWithLayout } from "../../../shared/layout";

const SitePage: NextPageWithLayout = () => {
  const router = useRouter();
  const { products, sites } = useRegistry();
  const siteId =
    typeof router.query["site-id"] === "string"
      ? router.query["site-id"]
      : (sites[0]?.slug ?? "");
  const opportunityStatusStore = useSupplyChainStatusState(siteId);

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
    <SiteOverview
      products={products}
      siteId={siteId}
      opportunityStatuses={opportunityStatusStore.statuses}
      opportunityStatusHistory={opportunityStatusStore.statusHistory}
      opportunityStatusActions={opportunityStatusStore.actions}
    />
  );
};

SitePage.getLayout = getSupplyChainLayout;

export default SitePage;
