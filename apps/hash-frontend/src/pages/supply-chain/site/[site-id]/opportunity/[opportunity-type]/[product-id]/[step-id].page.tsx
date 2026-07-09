import { NextSeo } from "next-seo";
import { useRouter } from "next/router";
import { useEffect } from "react";

import {
  ErrorState,
  SupplyChainAppSkeleton,
} from "../../../../../shared/load-state";
import { useRegistry } from "../../../../../shared/registry-context";
import { normaliseSiteCode } from "../../../../../shared/site-code";
import { getSupplyChainLayout } from "../../../../../shared/supply-chain-layout";
import {
  trackSupplyChainInteraction,
  trackSupplyChainViewed,
} from "../../../../../shared/telemetry";
import { OpportunityBrief } from "../../../../../supply-chain-data-shell/opportunity";

import type { NextPageWithLayout } from "../../../../../../../shared/layout";
import type { OpportunityType } from "../../../../../supply-chain-data-shell/opportunity/opportunity-utils";

const normaliseOpportunityType = (value: string | undefined): OpportunityType =>
  value === "planning" ? "planning" : "dwell";

const OpportunityPage: NextPageWithLayout = () => {
  const router = useRouter();
  const { products } = useRegistry();
  const query = router.query as {
    "site-id"?: string;
    "opportunity-type"?: string;
    "product-id"?: string;
    "step-id"?: string;
  };
  const siteId = normaliseSiteCode(query["site-id"] ?? "");
  const productId = query["product-id"] ?? "";
  const stepId = query["step-id"] ?? "";
  const opportunityType = normaliseOpportunityType(query["opportunity-type"]);

  const productName = products.find(
    (product) => product.id === productId,
  )?.name;

  const opportunityLabel =
    opportunityType === "planning" ? "Planning" : "Dwell";

  const seoTitle = `${opportunityLabel}${
    productName ? ` – ${productName}` : ""
  }`;

  useEffect(() => {
    if (!siteId || !productId || !stepId) {
      return;
    }

    trackSupplyChainViewed({
      opportunityType,
      productId,
      route:
        "/supply-chain/site/[site-id]/opportunity/[opportunity-type]/[product-id]/[step-id]",
      siteId,
      source: "opportunity_brief",
      stepId,
    });
    trackSupplyChainInteraction({
      interaction: "opportunity_brief_opened",
      opportunityType,
      productId,
      siteId,
      source: "opportunity_brief",
      stepId,
    });
  }, [opportunityType, productId, siteId, stepId]);

  return (
    <>
      <NextSeo title={seoTitle} />
      {!router.isReady ? (
        <SupplyChainAppSkeleton />
      ) : !siteId || !productId || !stepId ? (
        <ErrorState message="Opportunity route is missing required IDs." />
      ) : (
        <OpportunityBrief
          products={products}
          siteId={siteId}
          productId={productId}
          stepId={stepId}
          opportunityType={opportunityType}
        />
      )}
    </>
  );
};

OpportunityPage.getLayout = getSupplyChainLayout;

export default OpportunityPage;
