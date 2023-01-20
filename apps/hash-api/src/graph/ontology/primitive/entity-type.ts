import { EntityType, VersionedUri } from "@blockprotocol/type-system";
import { UpdateEntityTypeRequest } from "@hashintel/hash-graph-client";
import { EntityTypeWithoutId } from "@local/hash-isomorphic-utils/graphql/types";
import { generateTypeId } from "@local/hash-isomorphic-utils/ontology-types";
import { AccountId, OwnedById } from "@local/hash-isomorphic-utils/types";

import { NotFoundError } from "../../../lib/error";
import {
  ImpureGraphFunction,
  PureGraphFunction,
  zeroedGraphResolveDepths,
} from "../..";
import {
  EntityTypeWithMetadata,
  linkEntityTypeUri,
  ontologyTypeEditionIdToVersionedUri,
  Subgraph,
  SubgraphRootTypes,
} from "../hash-subgraph/src";
import { getRoots } from "../hash-subgraph/src/stdlib/roots";
import { getNamespaceOfAccountOwner } from "./util";

/**
 * Create an entity type.
 *
 * @param params.ownedById - the id of the account who owns the entity type
 * @param params.schema - the `EntityType`
 * @param params.actorId - the id of the account that is creating the entity type
 */
export const createEntityType: ImpureGraphFunction<
  {
    ownedById: OwnedById;
    schema: EntityTypeWithoutId;
    actorId: AccountId;
  },
  Promise<EntityTypeWithMetadata>
> = async (ctx, params) => {
  const { ownedById, actorId } = params;
  const namespace = await getNamespaceOfAccountOwner(ctx, {
    ownerId: params.ownedById,
  });

  const entityTypeId = generateTypeId({
    namespace,
    kind: "entity-type",
    title: params.schema.title,
  });

  const schema = { $id: entityTypeId, ...params.schema };

  const { graphApi } = ctx;

  const { data: metadata } = await graphApi.createEntityType({
    actorId,
    ownedById,
    schema,
  });

  return { schema, metadata };
};

/**
 * Get an entity type by its versioned URI.
 *
 * @param params.entityTypeId the unique versioned URI for an entity type.
 */
export const getEntityTypeById: ImpureGraphFunction<
  {
    entityTypeId: VersionedUri;
  },
  Promise<EntityTypeWithMetadata>
> = async ({ graphApi }, params) => {
  const { entityTypeId } = params;

  const entityTypeSubgraph = await graphApi
    .getEntityTypesByQuery({
      filter: {
        equal: [{ path: ["versionedUri"] }, { parameter: entityTypeId }],
      },
      graphResolveDepths: zeroedGraphResolveDepths,
      timeProjection: {
        kernel: {
          axis: "transaction",
          timestamp: null,
        },
        image: {
          axis: "decision",
          start: null,
          end: null,
        },
      },
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
 * @param params.entityTypeId - the id of the entity type that's being updated
 * @param params.schema - the updated `EntityType`
 * @param params.actorId - the id of the account that is updating the entity type
 */
export const updateEntityType: ImpureGraphFunction<
  {
    entityTypeId: VersionedUri;
    schema: Omit<EntityType, "$id">;
    actorId: AccountId;
  },
  Promise<EntityTypeWithMetadata>
> = async ({ graphApi }, params) => {
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

export const isEntityTypeLinkEntityType: PureGraphFunction<
  {
    entityType: EntityTypeWithMetadata;
  },
  boolean
> = (params) => {
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
