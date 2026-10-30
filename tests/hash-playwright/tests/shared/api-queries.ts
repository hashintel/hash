import { getRoots } from "@blockprotocol/graph/stdlib";
import { HashEntity } from "@local/hash-graph-sdk/entity";
import { deserializeSubgraph } from "@local/hash-graph-sdk/subgraph";
import { apiOrigin } from "@local/hash-isomorphic-utils/environment";

import {
  createEntityTypeMutation,
  updateEntityTypeMutation,
} from "../graphql/queries/entity-type.queries";
import { createEntityMutation } from "../graphql/queries/entity.queries";
import { requestFileUploadMutation } from "../graphql/queries/file.queries";
import { meQuery } from "../graphql/queries/user.queries";

import type {
  CreateEntityMutation,
  CreateEntityMutationVariables,
  CreateEntityTypeMutation,
  CreateEntityTypeMutationVariables,
  LinkedEntityDefinition,
  MeQuery,
  MeQueryVariables,
  RequestFileUploadMutation,
  RequestFileUploadMutationVariables,
  UpdateEntityTypeMutation,
  UpdateEntityTypeMutationVariables,
} from "../graphql/api-types.gen";
import type { EntityRootType } from "@blockprotocol/graph";
import type {
  Entity,
  EntityTypeWithMetadata,
  LinkData,
  TypeIdsAndPropertiesForEntity,
  VersionedUrl,
  WebId,
} from "@blockprotocol/type-system";
import type { ConstructEntityTypeParams } from "@local/hash-graph-sdk/ontology";
import type {
  File,
  User,
} from "@local/hash-isomorphic-utils/system-types/shared";
import type { APIRequestContext } from "@playwright/test";
import type { GraphQLError } from "graphql/error";

/**
 * Playwright's request client never times out idle keep-alive sockets, so it
 * can reuse one just as the API closes it, and the request fails with
 * `ECONNRESET`. Closing each connection after its response avoids reuse.
 */
const closeConnectionHeaders = { connection: "close" };

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
  const resp = await requestContext.post(`${apiOrigin}/graphql`, {
    data: { query, variables },
    headers: closeConnectionHeaders,
  });
  if (!resp.ok()) {
    throw new Error(
      `GraphQL request failed: ${resp.status()} ${resp.statusText()}`,
    );
  }
  const body = (await resp.json()) as {
    data?: Response;
    errors?: GraphQLError[];
  };
  if (body.errors?.length) {
    throw new Error(
      `GraphQL errors: ${body.errors.map((err) => err.message).join(", ")}`,
    );
  }
  return body;
};

export const getUser = async (requestContext: APIRequestContext) => {
  const { data } = await callGraphQlApi<MeQuery, MeQueryVariables>(
    requestContext,
    { query: meQuery },
  );
  if (!data) {
    throw new Error("meQuery returned no data");
  }
  return getRoots(
    deserializeSubgraph<EntityRootType<HashEntity<User>>>(data.me.subgraph),
  )[0];
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

/** Creates an entity type in the web of the user making the request. */
export const createEntityType = async (
  requestContext: APIRequestContext,
  entityType: ConstructEntityTypeParams,
): Promise<EntityTypeWithMetadata> => {
  const { data } = await callGraphQlApi<
    CreateEntityTypeMutation,
    CreateEntityTypeMutationVariables
  >(requestContext, {
    query: createEntityTypeMutation,
    variables: { entityType },
  });
  if (!data) {
    throw new Error("createEntityType returned no data");
  }
  return data.createEntityType;
};

export const updateEntityType = async (
  requestContext: APIRequestContext,
  params: {
    entityTypeId: VersionedUrl;
    updatedEntityType: ConstructEntityTypeParams;
  },
): Promise<EntityTypeWithMetadata> => {
  const { data } = await callGraphQlApi<
    UpdateEntityTypeMutation,
    UpdateEntityTypeMutationVariables
  >(requestContext, {
    query: updateEntityTypeMutation,
    variables: params,
  });
  if (!data) {
    throw new Error("updateEntityType returned no data");
  }
  return data.updateEntityType;
};

/**
 * Creates a file entity in the given web and uploads the file's contents to
 * the storage URL the API returns.
 */
export const uploadFile = async (
  requestContext: APIRequestContext,
  params: {
    contents: Buffer;
    mimeType: string;
    name: string;
    webId: WebId;
  },
): Promise<HashEntity<File>> => {
  const { data } = await callGraphQlApi<
    RequestFileUploadMutation,
    RequestFileUploadMutationVariables
  >(requestContext, {
    query: requestFileUploadMutation,
    variables: {
      name: params.name,
      size: params.contents.byteLength,
      fileEntityCreationInput: { webId: params.webId },
    },
  });
  if (!data) {
    throw new Error("requestFileUpload returned no data");
  }

  const { entity, presignedPut } = data.requestFileUpload;

  const resp = await requestContext.put(presignedPut.url, {
    data: params.contents,
    headers: { ...closeConnectionHeaders, "content-type": params.mimeType },
  });
  if (!resp.ok()) {
    throw new Error(
      `File upload failed: ${resp.status()} ${resp.statusText()}`,
    );
  }

  return new HashEntity<File>(entity);
};
