import { EntityId } from "@local/hash-subgraph/.";

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
