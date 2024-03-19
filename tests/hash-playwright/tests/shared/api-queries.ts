import type { VersionedUrl } from "@blockprotocol/graph";
import { apiOrigin } from "@local/hash-isomorphic-utils/environment";
import type { UserProperties } from "@local/hash-isomorphic-utils/system-types/shared";
import type {
  Entity,
  EntityPropertiesObject,
  LinkData,
  OwnedById,
} from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/stdlib";
import type { APIRequestContext } from "@playwright/test";
import type { GraphQLError } from "graphql/error";

import type {
  CreateEntityMutation,
  CreateEntityMutationVariables,
  LinkedEntityDefinition,
  MeQuery,
  MeQueryVariables,
} from "../graphql/api-types.gen";
import { createEntityMutation } from "../graphql/queries/entity.queries";
import { meQuery } from "../graphql/queries/user.queries";

const callGraphQlApi = async <Response, Variables>(
  requestContext: APIRequestContext,
  {
    query,
    variables,
  }: {
    query: string;
    variables?: Variables;
  },
): Promise<{ data?: Response; errors?: GraphQLError[] }> => {
  return requestContext
    .post(`${apiOrigin}/graphql`, {
      data: { query, variables },
    })
    .then(
      (resp) =>
        resp.json() as Promise<{ data?: Response; errors?: GraphQLError[] }>,
    );
};

export const getUser = async (requestContext: APIRequestContext) => {
  return callGraphQlApi<MeQuery, MeQueryVariables>(requestContext, {
    query: meQuery,
  }).then(({ data }) => {
    return !data
      ? undefined
      : (getRoots(data.me.subgraph)[0] as Entity<UserProperties>);
  });
};

export const createEntity = async (
  requestContext: APIRequestContext,
  params: {
    draft: boolean;
    entityTypeId: VersionedUrl;
    properties: EntityPropertiesObject;
    linkData?: LinkData;
    linkedEntities?: LinkedEntityDefinition[];
    ownedById: OwnedById;
  },
): Promise<Entity> => {
  return callGraphQlApi<CreateEntityMutation, CreateEntityMutationVariables>(
    requestContext,
    {
      query: createEntityMutation,
      variables: {
        draft: params.draft,
        entityTypeId: params.entityTypeId,
        properties: params.properties,
        linkData: params.linkData,
        linkedEntities: params.linkedEntities,
        ownedById: params.ownedById,
      },
    },
  ).then(({ data }) => {
    if (!data) {
      throw new Error("Entity not created");
    }
    return data.createEntity;
  });
};
