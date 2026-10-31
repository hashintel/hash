import { useQuery } from "@apollo/client";
import { useMemo } from "react";

import { getRoots } from "@blockprotocol/graph/stdlib";
import { splitEntityId } from "@blockprotocol/type-system";
import { deserializeSubgraph } from "@local/hash-graph-sdk/subgraph";
import { validateFlowDefinitionEntity } from "@local/hash-isomorphic-utils/flows/mappings";
import {
  currentTimeInstantTemporalAxes,
  generateTimeInstantTemporalAxes,
  zeroedOntologyResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import { queryEntitySubgraphQuery } from "../../graphql/queries/knowledge/entity.queries";

import type {
  QueryEntitySubgraphQuery,
  QueryEntitySubgraphQueryVariables,
} from "../../graphql/api-types.gen";
import type { EntityRootType } from "@blockprotocol/graph";
import type { EntityId, Timestamp } from "@blockprotocol/type-system";
import type {
  Filter,
  QueryTemporalAxesUnresolved,
} from "@local/hash-graph-client";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import type { FlowDefinition as FlowDefinitionEntity } from "@local/hash-isomorphic-utils/system-types/flowdefinition";

/**
 * A flow definition loaded from the graph, with the entity id of the `Flow Definition` entity that holds it. A flow
 * can be saved before it's valid, so its `flowDefinition` is null until its `diagnostics` have no errors.
 */
export type LoadedFlowDefinition = {
  flowDefinitionEntityId: EntityId;
} & ReturnType<typeof validateFlowDefinitionEntity>;

const flowDefinitionsQueryVariables = (
  filter: Filter,
  temporalAxes: QueryTemporalAxesUnresolved,
): QueryEntitySubgraphQueryVariables => ({
  request: {
    filter: {
      all: [
        filter,
        {
          equal: [
            { path: ["type", "baseUrl"] },
            { parameter: systemEntityTypes.flowDefinition.entityTypeBaseUrl },
          ],
        },
        { equal: [{ path: ["archived"] }, { parameter: false }] },
      ],
    },
    graphResolveDepths: zeroedOntologyResolveDepths,
    traversalPaths: [],
    temporalAxes,
    includeDrafts: false,
    includePermissions: false,
  },
});

/**
 * The flow definitions the `Flow Definition` entities in a query's result hold, whether or not they're valid.
 */
const getFlowDefinitionsFromQueryResult = (
  data: QueryEntitySubgraphQuery | undefined,
): LoadedFlowDefinition[] => {
  if (!data) {
    return [];
  }

  const subgraph = deserializeSubgraph<
    EntityRootType<HashEntity<FlowDefinitionEntity>>
  >(data.queryEntitySubgraph.subgraph);

  return getRoots(subgraph).map((entity) => ({
    flowDefinitionEntityId: entity.metadata.recordId.entityId,
    ...validateFlowDefinitionEntity(entity),
  }));
};

/**
 * The current edition of every flow definition the user can view.
 */
export const useFlowDefinitions = (): {
  flowDefinitions: LoadedFlowDefinition[];
  loading: boolean;
} => {
  const { data, loading } = useQuery<
    QueryEntitySubgraphQuery,
    QueryEntitySubgraphQueryVariables
  >(queryEntitySubgraphQuery, {
    variables: flowDefinitionsQueryVariables(
      { all: [] },
      currentTimeInstantTemporalAxes,
    ),
    fetchPolicy: "cache-and-network",
  });

  const flowDefinitions = useMemo(
    () => getFlowDefinitionsFromQueryResult(data),
    [data],
  );

  return { flowDefinitions, loading };
};

/**
 * A flow definition as it was at a moment, e.g. when a run started: the edition the run executed.
 */
export const useFlowDefinitionAtTime = (params: {
  flowDefinitionEntityId: EntityId | null;
  timestamp: Timestamp | null;
}): { flowDefinition: LoadedFlowDefinition | null; loading: boolean } => {
  const { flowDefinitionEntityId, timestamp } = params;

  const [webId, entityUuid] = flowDefinitionEntityId
    ? splitEntityId(flowDefinitionEntityId)
    : [];

  const { data, loading } = useQuery<
    QueryEntitySubgraphQuery,
    QueryEntitySubgraphQueryVariables
  >(queryEntitySubgraphQuery, {
    variables: flowDefinitionsQueryVariables(
      {
        all: [
          { equal: [{ path: ["webId"] }, { parameter: webId }] },
          { equal: [{ path: ["uuid"] }, { parameter: entityUuid }] },
        ],
      },
      timestamp
        ? generateTimeInstantTemporalAxes(timestamp)
        : currentTimeInstantTemporalAxes,
    ),
    skip: !flowDefinitionEntityId || !timestamp,
    fetchPolicy: "cache-first",
  });

  const flowDefinition = useMemo(
    () => getFlowDefinitionsFromQueryResult(data)[0] ?? null,
    [data],
  );

  return { flowDefinition, loading };
};
