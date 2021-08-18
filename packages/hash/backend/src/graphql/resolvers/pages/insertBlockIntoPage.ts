import { ApolloError } from "apollo-server-express";

import { genId } from "../../../util";
import { DbPage } from "../../../types/dbTypes";
import {
  MutationInsertBlockIntoPageArgs,
  Resolver,
  Visibility,
} from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";

export const insertBlockIntoPage: Resolver<
  Promise<DbPage>,
  {},
  GraphQLContext,
  MutationInsertBlockIntoPageArgs
> = async (
  _,
  {
    componentId,
    entityId,
    entityProperties,
    entityType,
    accountId,
    pageMetadataId,
    position,
  },
  { dataSources }
) => {
  return await dataSources.db.transaction(async (client): Promise<DbPage> => {
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
    } else if (entityProperties && entityType) {
      // Create new entity
      entity = await dataSources.db.createEntity({
        accountId,
        createdById: genId(), // TODO
        type: entityType,
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
      entityType: entity.type,
      entityId: entity.entityVersionId,
      accountId: entity.accountId,
    };

    const newBlock = await dataSources.db.createEntity({
      accountId,
      type: "Block",
      createdById: genId(), // TODO
      properties: blockProperties,
      versioned: true,
    });

    // Get and update the page.
    // @todo: always get the latest version for now. This is a temporary measure.
    // return here when strict vs. optimistic entity mutation question is resolved.
    const page = await client.getLatestEntityVersion({
      accountId,
      metadataId: pageMetadataId,
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

    const updatedEntities = await client.updateEntity(page);

    // TODO: for now, all entities are non-versioned, so the list array only have a single
    // element. Return when versioned entities are implemented at the API layer.
    return {
      ...updatedEntities[0],
      type: "Page",
      id: updatedEntities[0].entityVersionId,
      accountId: updatedEntities[0].accountId,
      visibility: Visibility.Public, // TODO: get from entity metadata
    };
  });
};
