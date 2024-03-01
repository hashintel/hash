import { bpMultiFilterToGraphFilter } from "@apps/hash-api/src/graph/knowledge/primitive/entity/query"; // @todo move to @libs
import { MultiFilter } from "@blockprotocol/graph";
import { GraphApi } from "@local/hash-graph-client";
import {
  currentTimeInstantTemporalAxes,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import { AccountId, Subgraph } from "@local/hash-subgraph";
import { mapGraphApiSubgraphToSubgraph } from "@local/hash-subgraph/src/stdlib/subgraph/roots";

export const getSubgraphFromBlockProtocolFilter = async ({
  authentication,
  graphApiClient,
  multiFilter,
}: {
  authentication: { actorId: AccountId };
  graphApiClient: GraphApi;
  multiFilter: MultiFilter;
}) => {
  const filter = bpMultiFilterToGraphFilter(multiFilter);

  const response = await graphApiClient.getEntitiesByQuery(
    authentication.actorId,
    {
      query: {
        filter,
        graphResolveDepths: zeroedGraphResolveDepths,
        temporalAxes: currentTimeInstantTemporalAxes,
        includeDrafts: false,
      },
    },
  );

  return mapGraphApiSubgraphToSubgraph(response.data.subgraph);
};

export const createGraphActivities = ({
  graphApiClient,
}: {
  graphApiClient: GraphApi;
}) => ({
  async getSubgraphFromBlockProtocolFilter({
    authentication,
    multiFilter,
  }: {
    authentication: { actorId: AccountId };
    multiFilter: MultiFilter;
  }): Promise<Subgraph> {
    return await getSubgraphFromBlockProtocolFilter({
      authentication,
      multiFilter,
      graphApiClient,
    });
  },
});
