import type { VersionedUrl } from "@blockprotocol/type-system/slim";
import { Entity, propertyObjectToPatches } from "@local/hash-graph-sdk/entity";
import type { EntityId, PropertyObject } from "@local/hash-graph-types/entity";

import type {
  UpdateEntityMutation,
  UpdateEntityMutationVariables,
} from "../../graphql/api-types.gen";
import { updateEntityMutation } from "../../graphql/queries/entity.queries";
import { queryGraphQlApi } from "../query-graphql-api";

export const updateEntity = (params: {
  entityId: EntityId;
  entityTypeId: VersionedUrl;
  updatedProperties: PropertyObject;
}): Promise<Entity> =>
  queryGraphQlApi<UpdateEntityMutation, UpdateEntityMutationVariables>(
    updateEntityMutation,
    {
      entityUpdate: {
        entityId: params.entityId,
        entityTypeId: params.entityTypeId,
        propertyPatches: propertyObjectToPatches(params.updatedProperties),
      },
    },
  ).then(({ data }) => {
    return new Entity(data.updateEntity);
  });
