import type { LinkData, WebId } from "@blockprotocol/type-system";
import { Entity } from "@local/hash-graph-sdk/entity";
import type { EntityProperties } from "@local/hash-graph-types/entity";
import { apiOrigin } from "@local/hash-isomorphic-utils/environment";
import { deserializeSubgraph } from "@local/hash-isomorphic-utils/subgraph-mapping";
import type { User } from "@local/hash-isomorphic-utils/system-types/shared";
import type { EntityRootType } from "@local/hash-subgraph";
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
      : getRoots(
          deserializeSubgraph<EntityRootType<User>>(data.me.subgraph),
        )[0];
  });
};

export const createEntity = async <T extends EntityProperties>(
  requestContext: APIRequestContext,
  params: {
    draft: boolean;
    entityTypeIds: T["entityTypeIds"];
    properties: T["propertiesWithMetadata"];
    linkData?: LinkData;
    linkedEntities?: LinkedEntityDefinition[];
    webId: WebId;
  },
): Promise<Entity<T>> => {
  return callGraphQlApi<CreateEntityMutation, CreateEntityMutationVariables>(
    requestContext,
    {
      query: createEntityMutation,
      variables: {
        draft: params.draft,
        entityTypeIds: params.entityTypeIds,
        properties: params.properties,
        linkData: params.linkData,
        linkedEntities: params.linkedEntities,
        webId: params.webId,
      },
    },
  ).then(({ data }) => {
    if (!data) {
      throw new Error("Entity not created");
    }
    return new Entity<T>(data.createEntity);
  });
};
