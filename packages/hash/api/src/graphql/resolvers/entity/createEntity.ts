import { ApolloError } from "apollo-server-express";

import {
  EntityDefinitionArgs,
  LinkedEntityDefinitionArgs,
  MutationCreateEntityArgs,
  Resolver,
} from "../../apiTypes.gen";
import { Entity, EntityType, UnresolvedGQLEntity, User } from "../../../model";
import { LoggedInGraphQLContext } from "../../context";
import { createEntityArgsBuilder } from "../util";
import { DBClient } from "../../../db";
import { linkedTreeFlatten } from "../../../util";

/**
 * @todo this assumption of the slug might be brittle,
 */
const capitalizeComponentName = (cId: string) => {
  let componentId = cId;

  // If there's a trailing slash, remove it
  const indexLastSlash = componentId.lastIndexOf("/");
  if (indexLastSlash === componentId.length - 1) {
    componentId = componentId.slice(0, -1);
  }

  //                      *
  // "https://example.org/value"
  const indexAfterLastSlash = componentId.lastIndexOf("/") + 1;
  return (
    //                      * and uppercase it
    // "https://example.org/value"
    componentId.charAt(indexAfterLastSlash).toUpperCase() +
    //                       ****
    // "https://example.org/value"
    componentId.substring(indexAfterLastSlash + 1)
  );
};

export const createEntityHelper = async (
  client: DBClient,
  params: {
    user: User;
    accountId: string;
    entityDefinition: Omit<EntityDefinitionArgs, "linkedEntities">;
  },
) => {
  const {
    entityProperties,
    entityId,
    entityType: { componentId, entityTypeId, systemTypeName },
    versioned,
  } = params.entityDefinition;

  let entityTypeVersionId =
    params.entityDefinition.entityType?.entityTypeVersionId;
  let entity;

  if (entityId) {
    // Use existing entityId
    entity = await Entity.getEntityLatestVersion(client, {
      accountId: params.accountId,
      entityId,
    });
    if (!entity) {
      throw new ApolloError(`Entity ${entityId} not found`, "NOT_FOUND");
    }
  } else if (entityProperties) {
    // entityTypeId, entityTypeVersionId and systemTypeName is hanedlled in Entity.create
    // We only handle componentId here if it's the only possibility.
    if (!entityTypeId && !entityTypeVersionId && !systemTypeName) {
      if (!componentId) {
        throw new ApolloError(
          `Given no valid type identifier. Must be etiher entityTypeId, entityTypeVersionId, systemTypeName or componentId`,
          "NOT_FOUND",
        );
      }

      // If type ID doesn't exist, we check the componentId
      let entityTypeWithComponentId =
        await EntityType.getEntityTypeByComponentId(client, {
          componentId,
        });

      // In case the entityType doesn't exist, create one with the appropriate component ID and name
      if (!entityTypeWithComponentId) {
        const systemAccountId = await client.getSystemAccountId();

        const name = capitalizeComponentName(componentId);
        entityTypeWithComponentId = await EntityType.create(client, {
          accountId: systemAccountId,
          createdByAccountId: params.user.accountId,
          name,
          schema: { componentId },
        });
      }

      entityTypeVersionId = entityTypeWithComponentId.entityVersionId;
    }

    // @todo: if we generate the entity IDs up-front, the entity and the block may
    // be created concurrently.
    // Create new entity since entityId has not been given.
    entity = await Entity.create(
      client,
      createEntityArgsBuilder({
        accountId: params.accountId,
        createdByAccountId: params.user.accountId,
        entityTypeId,
        entityTypeVersionId,
        systemTypeName,
        properties: entityProperties,
        versioned: versioned ?? true,
      }),
    );
  } else {
    throw new Error(
      `One of entityId OR entityProperties and entityType must be provided`,
    );
  }
  return entity;
};

export const createEntityWithLinks = async (
  client: DBClient,
  params: {
    user: User;
    accountId: string;
    entityDefinition: EntityDefinitionArgs;
  },
): Promise<Entity> => {
  const { user, accountId, entityDefinition: entityDefinitions } = params;
  if (params.entityDefinition.linkedEntities != null) {
    const result = linkedTreeFlatten<
      EntityDefinitionArgs,
      LinkedEntityDefinitionArgs,
      "linkedEntities",
      "entity"
    >(entityDefinitions, "linkedEntities", "entity");

    const entities: {
      link?: {
        parentIndex: number;
        meta: Omit<LinkedEntityDefinitionArgs, "entity">;
      };
      entity: Entity;
    }[] = [];

    // Promises are resolved sequentially because of transaction nesting issues
    for (const entityDefinition of result) {
      // Root entity does not have a link.
      entities.push({
        link: entityDefinition.meta
          ? {
              parentIndex: entityDefinition.parentIndex,
              meta: entityDefinition.meta,
            }
          : undefined,
        entity: await createEntityHelper(client, {
          user,
          accountId,
          entityDefinition,
        }),
      });
    }

    await Promise.all(
      entities.map(async ({ link, entity }) => {
        if (link) {
          const parentEntity = entities[link.parentIndex];
          if (!parentEntity) {
            throw new ApolloError(
              "Could not find parent entity",
              "INTERNAL_SERVER_ERROR",
            );
          }

          return await parentEntity.entity.createOutgoingLink(client, {
            createdByAccountId: user.accountId,
            destination: entity,
            stringifiedPath: link.meta.destinationPath,
          });
        }
        return null;
      }),
    );

    if (entities.length > 0) {
      // First element will be the root entity.
      return entities[0].entity;
    } else {
      throw new ApolloError(
        "Could not create entity tree",
        "INTERNAL_SERVER_ERROR",
      );
    }
  } else {
    return await createEntityHelper(client, {
      user,
      accountId,
      entityDefinition: params.entityDefinition,
    });
  }
};

export const createEntity: Resolver<
  Promise<UnresolvedGQLEntity>,
  {},
  LoggedInGraphQLContext,
  MutationCreateEntityArgs
> = async (
  _,
  { accountId, entity: entityDefinition },
  { dataSources, user },
) => {
  /** @todo restrict creation of protected types, e.g. User, Org */
  const entity = await createEntityWithLinks(dataSources.db, {
    user,
    accountId,
    entityDefinition,
  });

  return entity.toGQLUnknownEntity();
};
