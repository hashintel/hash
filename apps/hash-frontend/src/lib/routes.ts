import { getBlockDomId } from "../shared/get-block-dom-id";

import type { EntityId } from "@blockprotocol/type-system";

export const constructPageRelativeUrl = (params: {
  workspaceShortname: string;
  pageEntityUuid: string;
  highlightedBlockEntityId?: EntityId;
}): string =>
  `/@${params.workspaceShortname}/${params.pageEntityUuid}${
    params.highlightedBlockEntityId
      ? `#${getBlockDomId(params.highlightedBlockEntityId)}`
      : ``
  }`;

export const constructDashboardRelativeUrl = (params: {
  dashboardEntityUuid: string;
}): string => `/dashboard/${params.dashboardEntityUuid}`;

/**
 * The path part of the router's `asPath`, without its query string or hash.
 */
export const getPathFromAsPath = (asPath: string): string =>
  asPath.split(/[?#]/)[0]!;
