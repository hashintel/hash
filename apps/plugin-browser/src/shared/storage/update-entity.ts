import { Entity, propertyObjectToPatches } from "@local/hash-graph-sdk/entity";
import type {
  EntityId,
  EntityProperties,
} from "@local/hash-graph-types/entity";

import type {
  UpdateEntityMutation,
  UpdateEntityMutationVariables,
} from "../../graphql/api-types.gen";
import { updateEntityMutation } from "../../graphql/queries/entity.queries";
import { queryGraphQlApi } from "../query-graphql-api";

export const updateEntity = <T extends EntityProperties>(params: {
  entityId: EntityId;
  entityTypeId: T["entityTypeId"];
  updatedProperties: T["propertiesWithMetadata"];
}): Promise<Entity<T>> =>
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
