import type { VersionedUrl } from "@blockprotocol/graph";
import { apiOrigin } from "@local/hash-isomorphic-utils/environment";
import { queryGraphQlApi } from "@local/hash-isomorphic-utils/query-graphql-api";
import type { UserProperties } from "@local/hash-isomorphic-utils/system-types/shared";
import type {
  Entity,
  EntityPropertiesObject,
  LinkData,
  OwnedById,
} from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/stdlib";

import type {
  CreateEntityMutation,
  CreateEntityMutationVariables,
  LinkedEntityDefinition,
  MeQuery,
  MeQueryVariables,
} from "../graphql/api-types.gen";
import { createEntityMutation } from "../graphql/queries/entity.queries";
import { meQuery } from "../graphql/queries/user.queries";

const getUser = async () => {
  return queryGraphQlApi<MeQuery, MeQueryVariables>({
    apiOrigin: `${apiOrigin}/graphql`,
    query: meQuery,
  }).then(({ data }) => {
    return getRoots(data.me.subgraph)[0] as Entity<UserProperties> | undefined;
  });
};

export const createEntity = async (params: {
  draft: boolean;
  entityTypeId: VersionedUrl;
  properties: EntityPropertiesObject;
  linkData?: LinkData;
  linkedEntities?: LinkedEntityDefinition[];
  ownedById: OwnedById;
}): Promise<Entity> => {
  return queryGraphQlApi<CreateEntityMutation, CreateEntityMutationVariables>({
    apiOrigin: `${apiOrigin}/graphql`,
    query: createEntityMutation,
    variables: {
      draft: params.draft,
      entityTypeId: params.entityTypeId,
      properties: params.properties,
      linkData: params.linkData,
      linkedEntities: params.linkedEntities,
      ownedById: params.ownedById,
    },
  }).then(({ data }) => {
    return data.createEntity;
  });
};
