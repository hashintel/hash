import { VersionedUrl } from "@blockprotocol/graph";
import { Entity, EntityPropertiesObject, LinkData } from "@local/hash-subgraph";

import {
  CreateEntityMutation,
  CreateEntityMutationVariables,
} from "../graphql/api-types.gen";
import { createEntityMutation } from "../graphql/queries/entity.queries";
import { queryGraphQlApi } from "./query-graphql-api";

export const createEntity = (params: {
  entityTypeId: VersionedUrl;
  properties: EntityPropertiesObject;
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
    return data.createEntity;
  });
