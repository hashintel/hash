import type { WebId } from "@blockprotocol/type-system";
import type { QueryEntitySubgraphRequest } from "@local/hash-graph-sdk/entity";
import {
  currentTimeInstantTemporalAxes,
  pageOrNotificationNotArchivedFilter,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import { pageEntityTypeFilter } from "@local/hash-isomorphic-utils/page-entity-type-ids";

export const getAccountPagesVariables = ({
  webId,
  includeArchived = false,
}: {
  webId?: WebId;
  includeArchived?: boolean;
}): { request: QueryEntitySubgraphRequest } => ({
  request: {
    filter: {
      all: [
        pageEntityTypeFilter,
        {
          equal: [{ path: ["webId"] }, { parameter: webId }],
        },
        ...(includeArchived ? [] : [pageOrNotificationNotArchivedFilter]),
      ],
    },
    graphResolveDepths: {
      isOfType: true,
    },
    traversalPaths: [
      {
        // the page's parent page (page -> [hasLeftEntity incoming 1] parent [hasRightEntity outgoing 1] -> page)
        edges: [
          { kind: "has-left-entity", direction: "incoming" },
          { kind: "has-right-entity", direction: "outgoing" },
        ],
      },
    ],
    temporalAxes: currentTimeInstantTemporalAxes,
    /**
     * When we support draft/published versions of pages, this will need to be varied depending on the calling context,
     * i.e. whether draft versions of pages are desired in the list of account pages.
     * When drafts ARE included, callers will need handle the subgraph roots potentially containing multiple different
     * versions of the same page – i.e. a live version and zero or more draft series
     * H-2430
     */
    includeDrafts: false,
    includePermissions: false,
  },
});
