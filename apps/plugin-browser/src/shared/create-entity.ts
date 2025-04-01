import type {
  LinkData,
  TypeIdsAndPropertiesForEntity,
} from "@blockprotocol/type-system";
import { HashEntity } from "@local/hash-graph-sdk/entity";

import type {
  CreateEntityMutation,
  CreateEntityMutationVariables,
} from "../graphql/api-types.gen";
import { createEntityMutation } from "../graphql/queries/entity.queries";
import { queryGraphQlApi } from "./query-graphql-api";

export const createEntity = <T extends TypeIdsAndPropertiesForEntity>(params: {
  entityTypeIds: T["entityTypeIds"];
  properties: T["propertiesWithMetadata"];
  linkData?: LinkData;
}): Promise<HashEntity<T>> =>
  queryGraphQlApi<CreateEntityMutation, CreateEntityMutationVariables>(
    createEntityMutation,
    {
      entityTypeIds: params.entityTypeIds,
      properties: params.properties,
      linkData: params.linkData,
    },
  ).then(({ data }) => {
    return new HashEntity<T>(data.createEntity);
  });
