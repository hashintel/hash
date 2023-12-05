import {
  currentTimeInstantTemporalAxes,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";

import { StructuralQueryEntitiesQueryVariables } from "../../graphql/api-types.gen";

export const getDraftEntitiesQueryVariables: StructuralQueryEntitiesQueryVariables =
  {
    query: {
      filter: {
        all: [
          {
            equal: [{ path: ["draft"] }, { parameter: true }],
          },
          {
            equal: [{ path: ["archived"] }, { parameter: false }],
          },
        ],
      },
      temporalAxes: currentTimeInstantTemporalAxes,
      graphResolveDepths: {
        ...zeroedGraphResolveDepths,
        isOfType: { outgoing: 1 },
      },
    },
    includePermissions: false,
  };
