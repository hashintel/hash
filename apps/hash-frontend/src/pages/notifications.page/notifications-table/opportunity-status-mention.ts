import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import { getOpportunityStatusUpdateHref } from "@local/hash-isomorphic-utils/supply-chain-paths";

import type { HashEntity } from "@local/hash-graph-sdk/entity";
import type { OpportunityStatusUpdate } from "@local/hash-isomorphic-utils/system-types/opportunitystatusupdate";

export const getOpportunityStatusMentionHref = (
  statusUpdate: HashEntity,
): string | undefined => {
  const { scopeKey, siteCode } = simplifyProperties(
    statusUpdate.properties as OpportunityStatusUpdate["properties"],
  );
  if (typeof scopeKey !== "string" || typeof siteCode !== "string") {
    return undefined;
  }

  return getOpportunityStatusUpdateHref({
    scopeKey,
    siteCode,
    statusUpdateEntityId: statusUpdate.metadata.recordId.entityId,
  });
};
