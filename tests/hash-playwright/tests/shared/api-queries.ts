import type { EntityRootType } from "@blockprotocol/graph";
import { getRoots } from "@blockprotocol/graph/stdlib";
import type {
  Entity,
  LinkData,
  TypeIdsAndPropertiesForEntity,
  WebId,
} from "@blockprotocol/type-system";
import { HashEntity } from "@local/hash-graph-sdk/entity";
import { deserializeSubgraph } from "@local/hash-graph-sdk/subgraph";
import { apiOrigin } from "@local/hash-isomorphic-utils/environment";
import type { User } from "@local/hash-isomorphic-utils/system-types/shared";
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
          deserializeSubgraph<EntityRootType<HashEntity<User>>>(
            data.me.subgraph,
          ),
        )[0];
  });
};

export const createEntity = async <T extends TypeIdsAndPropertiesForEntity>(
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
    return new HashEntity<T>(data.createEntity);
  });
};
