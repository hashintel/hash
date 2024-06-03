import type { EntityId } from "@local/hash-graph-types/entity";

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
