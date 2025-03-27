import type { EntityTypeRootType } from "@blockprotocol/graph";
import { getRoots } from "@blockprotocol/graph/stdlib";
import { mapGqlSubgraphFieldsFragmentToSubgraph } from "@local/hash-isomorphic-utils/graph-queries";
import { useEffect } from "react";

import type {
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
      const mappedSubgraph =
        mapGqlSubgraphFieldsFragmentToSubgraph<EntityTypeRootType>(apiSubgraph);

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
