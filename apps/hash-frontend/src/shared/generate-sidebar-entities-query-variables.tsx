import {
  currentTimeInstantTemporalAxes,
  ignoreNoisySystemTypesFilter,
} from "@local/hash-isomorphic-utils/graph-queries";

import type { SummarizeEntitiesQueryVariables } from "../graphql/api-types.gen";
import type { WebId } from "@blockprotocol/type-system";

/**
 * These are the variables for the query which populates the "Entities" section of the sidebar,
 * if the user has chosen to show it as a toggleable list of types rather than a single 'Entities' link.
 */
export const generateSidebarEntitiesQueryVariables = ({
  webId,
}: {
  webId: WebId;
}): SummarizeEntitiesQueryVariables => {
  return {
    request: {
      /**
       * We only request the per-typeId counts, to filter the sidebar types to those for
       * which the active workspace has at least one entity.
       */
      includeTypeIds: true,
      filter: {
        all: [
          {
            notEqual: [{ path: ["archived"] }, { parameter: true }],
          },
          {
            equal: [{ path: ["webId"] }, { parameter: webId }],
          },
          ignoreNoisySystemTypesFilter,
        ],
      },
      temporalAxes: currentTimeInstantTemporalAxes,
      includeDrafts: false,
    },
  };
};
