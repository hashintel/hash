import { useQuery } from "@apollo/client";
import { useMemo } from "react";

import { getRoots } from "@blockprotocol/graph/stdlib";
import { extractEntityUuidFromEntityId } from "@blockprotocol/type-system";
import { deserializeSubgraph } from "@local/hash-graph-sdk/subgraph";
import { getFlowDefinitionFromEntity } from "@local/hash-isomorphic-utils/flows/mappings";
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
import type { EntityUuid, Timestamp } from "@blockprotocol/type-system";
import type {
  Filter,
  QueryTemporalAxesUnresolved,
} from "@local/hash-graph-client";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import type { FlowDefinitionWithId } from "@local/hash-isomorphic-utils/flows/types";
import type { FlowDefinition as FlowDefinitionEntity } from "@local/hash-isomorphic-utils/system-types/flowdefinition";

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
 * The flow definitions the `Flow Definition` entities in a query's result hold. An entity whose definition is
 * invalid is left out, with an error logged.
 */
const getFlowDefinitionsFromQueryResult = (
  data: QueryEntitySubgraphQuery | undefined,
): FlowDefinitionWithId[] => {
  if (!data) {
    return [];
  }

  const subgraph = deserializeSubgraph<
    EntityRootType<HashEntity<FlowDefinitionEntity>>
  >(data.queryEntitySubgraph.subgraph);

  return getRoots(subgraph).flatMap((entity) => {
    const flowDefinitionId = extractEntityUuidFromEntityId(
      entity.metadata.recordId.entityId,
    );

    try {
      return {
        flowDefinitionId,
        flowDefinition: getFlowDefinitionFromEntity(entity),
      };
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(
        `Flow definition ${flowDefinitionId} is invalid, so isn't shown: ${(error as Error).message}`,
      );
      return [];
    }
  });
};

/**
 * The current edition of every flow definition the user can view.
 */
export const useFlowDefinitions = (): {
  flowDefinitions: FlowDefinitionWithId[];
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
  flowDefinitionId: EntityUuid | null;
  timestamp: Timestamp | null;
}): { flowDefinition: FlowDefinitionWithId | null; loading: boolean } => {
  const { flowDefinitionId, timestamp } = params;

  const { data, loading } = useQuery<
    QueryEntitySubgraphQuery,
    QueryEntitySubgraphQueryVariables
  >(queryEntitySubgraphQuery, {
    variables: flowDefinitionsQueryVariables(
      { equal: [{ path: ["uuid"] }, { parameter: flowDefinitionId }] },
      timestamp
        ? generateTimeInstantTemporalAxes(timestamp)
        : currentTimeInstantTemporalAxes,
    ),
    skip: !flowDefinitionId || !timestamp,
    fetchPolicy: "cache-first",
  });

  const flowDefinition = useMemo(
    () => getFlowDefinitionsFromQueryResult(data)[0] ?? null,
    [data],
  );

  return { flowDefinition, loading };
};
