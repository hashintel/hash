import type { EntityId } from "@blockprotocol/type-system";

import { getBlockDomId } from "../shared/get-block-dom-id";

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
