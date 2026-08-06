import { extractEntityUuidFromEntityId } from "@blockprotocol/type-system";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";

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

  const params = new URLSearchParams({
    opportunity: scopeKey,
    statusUpdate: extractEntityUuidFromEntityId(
      statusUpdate.metadata.recordId.entityId,
    ),
  });

  return `/supply-chain/site/${encodeURIComponent(siteCode)}?${params.toString()}`;
};
