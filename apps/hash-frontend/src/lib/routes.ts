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
