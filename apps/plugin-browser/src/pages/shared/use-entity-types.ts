import type { EntityTypeRootType } from "@blockprotocol/graph";
import { getRoots } from "@blockprotocol/graph/stdlib";
import {
  deserializeQueryEntityTypeSubgraphResponse,
  type QueryEntityTypeSubgraphParams,
} from "@local/hash-graph-sdk/entity-type";
import {
  fullTransactionTimeAxis,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import { useEffect } from "react";

import type {
  QueryEntityTypeSubgraphQuery,
  QueryEntityTypeSubgraphQueryVariables,
} from "../../graphql/api-types.gen";
import { queryEntityTypeSubgraphQuery } from "../../graphql/queries/entity-type.queries";
import { queryGraphQlApi } from "../../shared/query-graphql-api";
import { useStorageSync } from "./use-storage-sync";

const queryEntityTypeSubgraph = (request: QueryEntityTypeSubgraphParams) => {
  return queryGraphQlApi<
    QueryEntityTypeSubgraphQuery,
    QueryEntityTypeSubgraphQueryVariables
  >(queryEntityTypeSubgraphQuery, {
    request,
  }).then(({ data }) => data.queryEntityTypeSubgraph);
};

export const useEntityTypes = () => {
  const [entityTypes, setEntityTypes] = useStorageSync("entityTypes", []);
  const [entityTypesSubgraph, setEntityTypesSubgraph] = useStorageSync(
    "entityTypesSubgraph",
    null,
  );

  useEffect(() => {
    void queryEntityTypeSubgraph({
      filter: { all: [] },
      temporalAxes: fullTransactionTimeAxis,
      graphResolveDepths: {
        constrainsValuesOn: 255,
        constrainsPropertiesOn: 255,
        inheritsFrom: 255,
      },
      traversalPaths: [],
    }).then((response) => {
      const mappedSubgraph =
        deserializeQueryEntityTypeSubgraphResponse(response).subgraph;

      const apiEntityTypes = getRoots<EntityTypeRootType>(mappedSubgraph);

      setEntityTypes(
        apiEntityTypes.sort((a, b) =>
          a.schema.title.localeCompare(b.schema.title),
        ),
      );
      setEntityTypesSubgraph(mappedSubgraph);
    });
  }, [setEntityTypes, setEntityTypesSubgraph]);

  return {
    entityTypes,
    entityTypesSubgraph,
  };
};
