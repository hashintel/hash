import {
  extractBaseUrl,
  extractEntityUuidFromEntityId,
} from "@blockprotocol/type-system";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import {
  constructDashboardRelativeUrl,
  constructPageRelativeUrl,
} from "../../../../lib/routes";

import type { EntityId, VersionedUrl } from "@blockprotocol/type-system";

export const getPageHref = ({
  entityId,
  entityTypeIds,
  webShortname,
}: {
  entityId: EntityId;
  entityTypeIds: VersionedUrl[];
  webShortname?: string;
}): string | null => {
  const pageEntityUuid = extractEntityUuidFromEntityId(entityId);

  if (
    entityTypeIds.some(
      (typeId) =>
        extractBaseUrl(typeId) ===
        systemEntityTypes.dashboard.entityTypeBaseUrl,
    )
  ) {
    return constructDashboardRelativeUrl({
      dashboardEntityUuid: pageEntityUuid,
    });
  }

  return webShortname
    ? constructPageRelativeUrl({
        workspaceShortname: webShortname,
        pageEntityUuid,
      })
    : null;
};
