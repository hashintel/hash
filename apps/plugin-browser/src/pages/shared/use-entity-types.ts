import { EntityTypeRootType, Subgraph } from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/stdlib";
import { useEffect } from "react";

import {
  GetEntityTypesQuery,
  GetEntityTypesQueryVariables,
} from "../../graphql/api-types.gen";
import { getEntityTypesQuery } from "../../graphql/queries/entity-type.queries";
import { queryGraphQlApi } from "../../shared/query-graphql-api";
import { useLocalStorage } from "./use-local-storage";

const getEntityTypes = () => {
  return queryGraphQlApi<GetEntityTypesQuery, GetEntityTypesQueryVariables>(
    getEntityTypesQuery,
  ).then(({ data: { queryEntityTypes } }) => {
    return getRoots<EntityTypeRootType>(
      /**
       * Asserted for two reasons:
       * 1. Inconsistencies between Graph API and hash-subgraph types
       * 2. The function signature of getRoots asks for all fields on a subgraph, when it only needs roots and vertices
       * @todo fix this in the Block Protocol package and then hash-subgraph
       */
      queryEntityTypes as Subgraph<EntityTypeRootType>,
    );
  });
};

export const useEntityTypes = () => {
  const [entityTypes, setEntityTypes] = useLocalStorage("entityTypes", []);

  useEffect(() => {
    void getEntityTypes().then((apiEntityTypes) => {
      setEntityTypes(
        apiEntityTypes.sort((a, b) =>
          a.schema.title.localeCompare(b.schema.title),
        ),
      );
    });
  }, [setEntityTypes]);

  return entityTypes;
};
