import type { EntityTypeRootType } from "@blockprotocol/graph";
import { getRoots } from "@blockprotocol/graph/stdlib";
import { deserializeQueryEntityTypeSubgraphResponse } from "@local/hash-graph-sdk/entity-type";
import { useEffect } from "react";

import type {
  QueryEntityTypeSubgraphQuery,
  QueryEntityTypeSubgraphQueryVariables,
} from "../../graphql/api-types.gen";
import { queryEntityTypeSubgraphQuery } from "../../graphql/queries/entity-type.queries";
import { queryGraphQlApi } from "../../shared/query-graphql-api";
import { useStorageSync } from "./use-storage-sync";

const queryEntityTypesSubgraph = () => {
  return queryGraphQlApi<
    QueryEntityTypeSubgraphQuery,
    QueryEntityTypeSubgraphQueryVariables
  >(queryEntityTypeSubgraphQuery).then(
    ({ data: { queryEntityTypeSubgraph } }) => queryEntityTypeSubgraph,
  );
};

export const useEntityTypes = () => {
  const [entityTypes, setEntityTypes] = useStorageSync("entityTypes", []);
  const [entityTypesSubgraph, setEntityTypesSubgraph] = useStorageSync(
    "entityTypesSubgraph",
    null,
  );

  useEffect(() => {
    void queryEntityTypesSubgraph().then((response) => {
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
