import {
  extractEntityUuidFromEntityId,
  extractWebIdFromEntityId,
} from "@blockprotocol/type-system";

import type { EntityId } from "@blockprotocol/type-system";

export const getOpportunityStatusUpdateHref = ({
  scopeKey,
  siteCode,
  statusUpdateEntityId,
}: {
  scopeKey: string;
  siteCode: string;
  statusUpdateEntityId: EntityId;
}): string => {
  const params = new URLSearchParams({
    opportunity: scopeKey,
    statusUpdate: extractEntityUuidFromEntityId(statusUpdateEntityId),
    webId: extractWebIdFromEntityId(statusUpdateEntityId),
  });

  return `/supply-chain/site/${encodeURIComponent(siteCode)}?${params.toString()}`;
};
