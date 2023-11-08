import {
  currentTimeInstantTemporalAxes,
  generateVersionedUrlMatchingFilter,
  notArchivedFilter,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import { systemTypes } from "@local/hash-isomorphic-utils/ontology-types";
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
        /**
         * We specify each of these page types individually rather than Page, which they both inherit from,
         * because checking against types involving inheritance is currently slow.
         * Once H-392 is implemented we can replace it with a single check against 'page', and don't ignore parents.
         * @todo update this once H-392 is implemented
         */
        generateVersionedUrlMatchingFilter(
          systemTypes.entityType.document.entityTypeId,
          { ignoreParents: true },
        ),
        generateVersionedUrlMatchingFilter(
          systemTypes.entityType.canvas.entityTypeId,
          { ignoreParents: true },
        ),
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
