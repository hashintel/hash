import type { VersionedUrl } from "@blockprotocol/type-system/slim";
import { Entity } from "@local/hash-graph-sdk/entity";
import type { LinkData, PropertyObject } from "@local/hash-graph-types/entity";

import type {
  CreateEntityMutation,
  CreateEntityMutationVariables,
} from "../graphql/api-types.gen";
import { createEntityMutation } from "../graphql/queries/entity.queries";
import { queryGraphQlApi } from "./query-graphql-api";

export const createEntity = (params: {
  entityTypeId: VersionedUrl;
  properties: PropertyObject;
  linkData?: LinkData;
}): Promise<Entity> =>
  queryGraphQlApi<CreateEntityMutation, CreateEntityMutationVariables>(
    createEntityMutation,
    {
      entityTypeId: params.entityTypeId,
      properties: params.properties,
      linkData: params.linkData,
    },
  ).then(({ data }) => {
    return new Entity(data.createEntity);
  });
