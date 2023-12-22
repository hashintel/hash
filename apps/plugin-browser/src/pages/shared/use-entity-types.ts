import type { Subgraph } from "@local/hash-graph-client";
import type { EntityTypeRootType } from "@local/hash-subgraph";
import {
  getRoots,
  mapGraphApiSubgraphToSubgraph,
} from "@local/hash-subgraph/stdlib";
import { useEffect } from "react";

import {
  GetEntityTypesQuery,
  GetEntityTypesQueryVariables,
} from "../../graphql/api-types.gen";
import { getEntityTypesQuery } from "../../graphql/queries/entity-type.queries";
import { queryGraphQlApi } from "../../shared/query-graphql-api";
import { useLocalStorage } from "./use-local-storage";

const getEntityTypesSubgraph = () => {
  return queryGraphQlApi<GetEntityTypesQuery, GetEntityTypesQueryVariables>(
    getEntityTypesQuery,
  ).then(({ data: { queryEntityTypes } }) => queryEntityTypes);
};

export const useEntityTypes = () => {
  const [entityTypes, setEntityTypes] = useLocalStorage("entityTypes", []);
  const [entityTypesSubgraph, setEntityTypesSubgraph] = useLocalStorage(
    "entityTypesSubgraph",
    null,
  );

  useEffect(() => {
    void getEntityTypesSubgraph().then((apiSubgraph) => {
      const mappedSubgraph = mapGraphApiSubgraphToSubgraph<EntityTypeRootType>(
        apiSubgraph as Subgraph, // @todo why is this necessary
      );

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
