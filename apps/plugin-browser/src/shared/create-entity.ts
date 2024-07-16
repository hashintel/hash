import { Entity } from "@local/hash-graph-sdk/entity";
import type {
  EntityProperties,
  LinkData,
} from "@local/hash-graph-types/entity";

import type {
  CreateEntityMutation,
  CreateEntityMutationVariables,
} from "../graphql/api-types.gen";
import { createEntityMutation } from "../graphql/queries/entity.queries";
import { queryGraphQlApi } from "./query-graphql-api";

export const createEntity = <T extends EntityProperties>(params: {
  entityTypeId: T["entityTypeId"];
  properties: T["propertiesWithMetadata"];
  linkData?: LinkData;
}): Promise<Entity<T>> =>
  queryGraphQlApi<CreateEntityMutation, CreateEntityMutationVariables>(
    createEntityMutation,
    {
      entityTypeId: params.entityTypeId,
      properties: params.properties,
      linkData: params.linkData,
    },
  ).then(({ data }) => {
    return new Entity<T>(data.createEntity);
  });
