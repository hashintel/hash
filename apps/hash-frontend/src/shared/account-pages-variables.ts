import {
  currentTimeInstantTemporalAxes,
  notArchivedFilter,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import { pageEntityTypeFilter } from "@local/hash-isomorphic-utils/page-entity-type-ids";
import type { OwnedById } from "@local/hash-subgraph";

export const getAccountPagesVariables = ({
  ownedById,
  includeArchived = false,
}: {
  ownedById?: OwnedById;
  includeArchived?: boolean;
}) => ({
  query: {
    filter: {
      all: [
        pageEntityTypeFilter,
        {
          equal: [{ path: ["ownedById"] }, { parameter: ownedById }],
        },
        ...(includeArchived ? [] : [notArchivedFilter]),
      ],
    },
    graphResolveDepths: {
      ...zeroedGraphResolveDepths,
      isOfType: { outgoing: 1 },
      // These depths are chosen to cover the following:
      //  - the page's parent page (page -> [hasLeftEntity incoming 1] parent [hasRightEntity outgoing 1] -> page)
      hasLeftEntity: { incoming: 1, outgoing: 0 },
      hasRightEntity: { incoming: 0, outgoing: 1 },
    },
    temporalAxes: currentTimeInstantTemporalAxes,
    /**
     * When we support draft/published versions of pages, this will need to be varied depending on the calling context,
     * i.e. whether draft versions of pages are desired in the list of account pages.
     * When drafts ARE included, callers will need handle the subgraph roots potentially containing multiple different
     * versions of the same page – i.e. a live version and zero or more draft series
     * H-2430
     */
    includeDrafts: false,
  },
  includePermissions: false,
});
