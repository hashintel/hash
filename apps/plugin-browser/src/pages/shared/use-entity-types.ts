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
import { useStorageSync } from "./use-storage-sync";

const getEntityTypesSubgraph = () => {
  return queryGraphQlApi<GetEntityTypesQuery, GetEntityTypesQueryVariables>(
    getEntityTypesQuery,
  ).then(({ data: { queryEntityTypes } }) => queryEntityTypes);
};

export const useEntityTypes = () => {
  const [entityTypes, setEntityTypes] = useStorageSync("entityTypes", []);
  const [entityTypesSubgraph, setEntityTypesSubgraph] = useStorageSync(
    "entityTypesSubgraph",
    null,
  );

  useEffect(() => {
    void getEntityTypesSubgraph().then((apiSubgraph) => {
      const mappedSubgraph = mapGraphApiSubgraphToSubgraph<EntityTypeRootType>(
        // @ts-expect-error - @todo figure out why this is necessary
        //                  - It's possible to remove the ts-expect-error when changing the entity metadata to contain
        //                    a list of entity types
        apiSubgraph as Subgraph,
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
