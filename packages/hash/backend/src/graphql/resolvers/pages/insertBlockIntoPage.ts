import { ApolloError } from "apollo-server-express";
import { UserInputError } from "apollo-server-errors";

import { genId } from "../../../util";
import {
  MutationInsertBlockIntoPageArgs,
  Resolver,
  UnknownEntity,
} from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";
import { dbEntityToGraphQLEntity } from "../../util";

export const insertBlockIntoPage: Resolver<
  Promise<UnknownEntity>,
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
      entity = await dataSources.db.getEntity({
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
      entity = await dataSources.db.createEntity({
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
      entityTypeId: entity.entityTypeId,
      accountId: entity.accountId,
    };

    const newBlock = await dataSources.db.createEntity({
      accountId,
      systemTypeName: "Block",
      createdById: genId(), // TODO
      properties: blockProperties,
      versioned: true,
    });

    // Get and update the page.
    // @todo: always get the latest version for now. This is a temporary measure.
    // return here when strict vs. optimistic entity mutation question is resolved.
    const page = await client.getEntityLatestVersion({
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

    const updatedEntities = (await client.updateEntity(page)).map(
      dbEntityToGraphQLEntity
    );

    // TODO: for now, all entities are non-versioned, so the list array only have a single
    // element. Return when versioned entities are implemented at the API layer.
    return updatedEntities[0];
  });
};
