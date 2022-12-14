import { AxiosError } from "axios";

import { EntityType, VersionedUri } from "@blockprotocol/type-system";
import { UpdateEntityTypeRequest } from "@hashintel/hash-graph-client";
import {
  EntityTypeWithMetadata,
  ontologyTypeEditionIdToVersionedUri,
  Subgraph,
  SubgraphRootTypes,
} from "@hashintel/hash-subgraph";
import { generateTypeId } from "@hashintel/hash-shared/ontology-types";
import { AccountId, OwnedById } from "@hashintel/hash-shared/types";
import { getRoots } from "@hashintel/hash-subgraph/src/stdlib/roots";
import { GraphContext, zeroedGraphResolveDepths } from "../..";
import { getNamespaceOfAccountOwner } from "./util";
import { linkEntityTypeUri } from "../../../model/util";
import { NotFoundError } from "../../../lib/error";

export type EntityTypeModelCreateParams = {
  ownedById: OwnedById;
  schema: Omit<EntityType, "$id">;
  actorId: AccountId;
};

/**
 * Create an entity type.
 *
 * @param params.ownedById - the id of the account who owns the entity type
 * @param params.schema - the `EntityType`
 * @param params.actorId - the id of the account that is creating the entity type
 */
export const createEntityType = async (
  { graphApi }: GraphContext,
  params: EntityTypeModelCreateParams,
): Promise<EntityTypeWithMetadata> => {
  const { ownedById, actorId } = params;
  const namespace = await getNamespaceOfAccountOwner(graphApi, {
    ownerId: params.ownedById,
  });

  const entityTypeId = generateTypeId({
    namespace,
    kind: "entity-type",
    title: params.schema.title,
  });
  const schema = { $id: entityTypeId, ...params.schema };

  const { data: metadata } = await graphApi
    .createEntityType({
      actorId,
      ownedById,
      schema,
    })
    .catch((err: AxiosError) => {
      throw new Error(
        err.response?.status === 409
          ? `entity type with the same URI already exists. [URI=${schema.$id}]`
          : `[${err.code}] couldn't create entity type: ${err.response?.data}.`,
      );
    });

  return { schema, metadata };
};

/**
 * Get an entity type by its versioned URI.
 *
 * @param params.entityTypeId the unique versioned URI for an entity type.
 */
export const getEntityType = async (
  { graphApi }: GraphContext,
  params: {
    entityTypeId: VersionedUri;
  },
): Promise<EntityTypeWithMetadata> => {
  const { entityTypeId } = params;

  const entityTypeSubgraph = await graphApi
    .getEntityTypesByQuery({
      filter: {
        equal: [{ path: ["versionedUri"] }, { parameter: entityTypeId }],
      },
      graphResolveDepths: zeroedGraphResolveDepths,
    })
    .then(({ data }) => data as Subgraph<SubgraphRootTypes["entityType"]>);

  const [entityType] = getRoots(entityTypeSubgraph);

  if (!entityType) {
    throw new NotFoundError(
      `Could not find entity type with ID "${entityTypeId}"`,
    );
  }

  return entityType;
};

/**
 * Update an entity type.
 *
 * @param params.schema - the updated `EntityType`
 * @param params.actorId - the id of the account that is updating the entity type
 */
export const updateEntityType = async (
  { graphApi }: GraphContext,
  params: {
    entityTypeId: VersionedUri;
    schema: Omit<EntityType, "$id">;
    actorId: AccountId;
  },
): Promise<EntityTypeWithMetadata> => {
  const { entityTypeId, schema, actorId } = params;
  const updateArguments: UpdateEntityTypeRequest = {
    actorId,
    typeToUpdate: entityTypeId,
    schema,
  };

  const { data: metadata } = await graphApi.updateEntityType(updateArguments);

  const { editionId } = metadata;

  return {
    schema: {
      ...schema,
      $id: ontologyTypeEditionIdToVersionedUri(editionId),
    },
    metadata,
  };
};

export const isEntityTypeLinkEntityType = (params: {
  entityType: EntityTypeWithMetadata;
}): boolean => {
  /**
   * @todo: account for link entity types being able to inherit from other link entity types
   * @see https://app.asana.com/0/1200211978612931/1201726402115269/f
   */
  const {
    entityType: { schema },
  } = params;

  return (
    !!schema.allOf &&
    schema.allOf.some(({ $ref }) => $ref === linkEntityTypeUri)
  );
};
