import type { VersionedUrl } from "@blockprotocol/graph";
import type {
  Entity,
  EntityId,
  EntityPropertiesObject,
} from "@local/hash-subgraph";

import type {
  UpdateEntityMutation,
  UpdateEntityMutationVariables,
} from "../../graphql/api-types.gen";
import { updateEntityMutation } from "../../graphql/queries/entity.queries";
import { queryGraphQlApi } from "../query-graphql-api";

export const updateEntity = (params: {
  entityId: EntityId;
  entityTypeId: VersionedUrl;
  updatedProperties: EntityPropertiesObject;
}): Promise<Entity> =>
  queryGraphQlApi<UpdateEntityMutation, UpdateEntityMutationVariables>(
    updateEntityMutation,
    {
      entityUpdate: {
        entityId: params.entityId,
        entityTypeId: params.entityTypeId,
        updatedProperties: params.updatedProperties,
      },
    },
  ).then(({ data }) => {
    return data.updateEntity;
  });
