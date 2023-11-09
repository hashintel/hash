import {
  currentTimeInstantTemporalAxes,
  generateVersionedUrlMatchingFilter,
  notArchivedFilter,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import { systemTypes } from "@local/hash-isomorphic-utils/ontology-types";
import { pageEntityTypeFilter } from "@local/hash-isomorphic-utils/src/page-entity-type-ids";
import { OwnedById } from "@local/hash-subgraph";

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
  },
  includePermissions: false,
});
