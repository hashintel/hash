import {
  currentTimeInstantTemporalAxes,
  ignoreNoisySystemTypesFilter,
} from "@local/hash-isomorphic-utils/graph-queries";

import type { QueryEntitiesQueryVariables } from "../graphql/api-types.gen";
import type { WebId } from "@blockprotocol/type-system";

/**
 * These are the variables for the query which populates the "Entities" section of the sidebar,
 * if the user has chosen to show it as a toggleable list of types rather than a single 'Entities' link.
 */
export const generateSidebarEntitiesQueryVariables = ({
  webId,
}: {
  webId: WebId;
}): QueryEntitiesQueryVariables => {
  return {
    request: {
      /**
       * We only make this request to get the count of entities by typeId to filter types in the sidebar,
       * to only those for which the active workspace has at least one entity.
       *
       * We don't actually need a single entity but the Graph rejects requests with a limit of 0.
       * We currently can't use countEntities as it just returns a total number, with no count by typeId.
       */
      limit: 1,
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
      includePermissions: false,
    },
  };
};
