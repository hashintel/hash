import { useRouter } from "next/router";

import { OpportunityBrief } from "../../../../../../../vct/supply-chain/opportunity";
import { useRegistry } from "../../../../../../../vct/supply-chain/shared/registry-context";
import { getSupplyChainLayout } from "../../../../../shared/supply-chain-layout";

import type { NextPageWithLayout } from "../../../../../../../shared/layout";
import type { OpportunityType } from "../../../../../../../vct/supply-chain/opportunity/opportunity-utils";

const normaliseOpportunityType = (value: string | undefined): OpportunityType =>
  value === "planning" ? "planning" : "dwell";

const OpportunityPage: NextPageWithLayout = () => {
  const router = useRouter();
  const { products, sites } = useRegistry();
  const query = router.query as {
    "site-id"?: string;
    "opportunity-type"?: string;
    "product-id"?: string;
    "step-id"?: string;
  };

  return (
    <OpportunityBrief
      products={products}
      siteId={query["site-id"] ?? sites[0]?.slug ?? ""}
      productId={query["product-id"] ?? ""}
      stepId={query["step-id"] ?? ""}
      opportunityType={normaliseOpportunityType(query["opportunity-type"])}
    />
  );
};

OpportunityPage.getLayout = getSupplyChainLayout;

export default OpportunityPage;
