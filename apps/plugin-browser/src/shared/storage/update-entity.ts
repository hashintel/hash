import type {
  EntityId,
  TypeIdsAndPropertiesForEntity,
} from "@blockprotocol/type-system";
import {
  HashEntity,
  propertyObjectToPatches,
} from "@local/hash-graph-sdk/entity";

import type {
  UpdateEntityMutation,
  UpdateEntityMutationVariables,
} from "../../graphql/api-types.gen";
import { updateEntityMutation } from "../../graphql/queries/entity.queries";
import { queryGraphQlApi } from "../query-graphql-api";

export const updateEntity = <T extends TypeIdsAndPropertiesForEntity>(params: {
  entityId: EntityId;
  entityTypeIds: T["entityTypeIds"];
  updatedProperties: T["propertiesWithMetadata"];
}): Promise<HashEntity<T>> =>
  queryGraphQlApi<UpdateEntityMutation, UpdateEntityMutationVariables>(
    updateEntityMutation,
    {
      entityUpdate: {
        entityId: params.entityId,
        entityTypeIds: params.entityTypeIds,
        propertyPatches: propertyObjectToPatches(params.updatedProperties),
      },
    },
  ).then(({ data }) => {
    return new HashEntity(data.updateEntity);
  });
