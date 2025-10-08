import type { ActorEntityUuid } from "@blockprotocol/type-system";
import type {
  EntityTraversalPath,
  Filter,
  GraphApi,
} from "@local/hash-graph-client";
import { queryEntitySubgraph } from "@local/hash-graph-sdk/entity";
import {
  currentTimeInstantTemporalAxes,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";

export const getSubgraphFromFilter = async ({
  authentication,
  filter,
  graphApiClient,
  traversalPaths,
}: {
  authentication: { actorId: ActorEntityUuid };
  filter: Filter;
  graphApiClient: GraphApi;
  traversalPaths: EntityTraversalPath[];
}) =>
  queryEntitySubgraph({ graphApi: graphApiClient }, authentication, {
    filter,
    graphResolveDepths: {
      ...zeroedGraphResolveDepths,
      isOfType: { outgoing: 1 },
      inheritsFrom: { outgoing: 255 },
      constrainsPropertiesOn: { outgoing: 255 },
      constrainsLinksOn: { outgoing: 255 },
    },
    traversalPaths,
    temporalAxes: currentTimeInstantTemporalAxes,
    includeDrafts: false,
    includePermissions: false,
  }).then(({ subgraph }) => subgraph);
