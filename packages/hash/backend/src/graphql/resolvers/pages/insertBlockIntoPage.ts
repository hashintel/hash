import { ApolloError } from "apollo-server-express";
import { UserInputError } from "apollo-server-errors";

import { genId } from "../../../util";
import { MutationInsertBlockIntoPageArgs, Resolver } from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";
import { Entity, EntityWithIncompleteEntityType } from "../../../model";

export const insertBlockIntoPage: Resolver<
  Promise<EntityWithIncompleteEntityType>,
  {},
  GraphQLContext,
  MutationInsertBlockIntoPageArgs
> = async (
  _,
  {
    componentId,
    entityId,
    entityProperties,
    entityTypeId,
    entityTypeVersionId,
    systemTypeName,
    accountId,
    pageMetadataId,
    position,
  },
  { dataSources }
) => {
  return await dataSources.db.transaction(async (client) => {
    let entity;
    if (entityId) {
      // Update
      entity = await Entity.getEntity(dataSources.db)({
        accountId,
        entityVersionId: entityId,
      });
      if (!entity) {
        throw new ApolloError(`entity ${entityId} not found`, "NOT_FOUND");
      }
    } else if (entityProperties) {
      if (!entityTypeId && !entityTypeVersionId && !systemTypeName) {
        throw new UserInputError(
          "One of entityTypeId, entityTypeVersionId, or systemTypeName must be provided"
        );
      }
      // Create new entity
      entity = await Entity.create(dataSources.db)({
        accountId,
        createdById: genId(), // TODO
        entityTypeId: entityTypeId ?? undefined,
        entityTypeVersionId,
        systemTypeName,
        properties: entityProperties,
        versioned: true,
      });
    } else {
      throw new Error(
        `One of entityId OR entityProperties and entityType must be provided`
      );
    }

    const blockProperties = {
      componentId,
      entityId: entity.entityVersionId,
      entityTypeId: entity.entityType.entityId,
      accountId: entity.accountId,
    };

    const newBlock = await Entity.create(dataSources.db)({
      accountId,
      systemTypeName: "Block",
      createdById: genId(), // TODO
      properties: blockProperties,
      versioned: true,
    });

    // Get and update the page.
    // @todo: always get the latest version for now. This is a temporary measure.
    // return here when strict vs. optimistic entity mutation question is resolved.
    const page = await Entity.getEntityLatestVersion(client)({
      accountId,
      entityId: pageMetadataId,
    });
    if (!page) {
      const msg = `Page ${pageMetadataId} not found in account ${accountId}`;
      throw new ApolloError(msg, "NOT_FOUND");
    }

    if (position > page.properties.contents.length) {
      position = page.properties.contents.length;
    }

    page.properties.contents = [
      ...page.properties.contents.slice(0, position),
      {
        type: "Block",
        entityId: newBlock.entityVersionId,
        accountId: newBlock.accountId,
      },
      ...page.properties.contents.slice(position),
    ];

    await page.updateProperties(client)(page.properties);

    // TODO: for now, all entities are non-versioned, so the list array only have a single
    // element. Return when versioned entities are implemented at the API layer.
    return page.toGQLUnknownEntity();
  });
};
