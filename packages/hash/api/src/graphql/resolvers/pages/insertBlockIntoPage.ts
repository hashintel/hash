import { ApolloError } from "apollo-server-express";
import { UserInputError } from "apollo-server-errors";

import { MutationInsertBlockIntoPageArgs, Resolver } from "../../apiTypes.gen";
import { Entity, UnresolvedGQLEntity } from "../../../model";
import { DbBlockProperties, DbPageProperties } from "../../../types/dbTypes";
import { LoggedInGraphQLContext } from "../../context";
import { createEntityArgsBuilder } from "../util";

export const insertBlockIntoPage: Resolver<
  Promise<UnresolvedGQLEntity>,
  {},
  LoggedInGraphQLContext,
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
    pageEntityId,
    ...args
  },
  { dataSources, user },
) => {
  return await dataSources.db.transaction(async (client) => {
    let entity;
    if (entityId) {
      // Update
      entity = await Entity.getEntityLatestVersion(client, {
        accountId,
        entityId,
      });
      if (!entity) {
        throw new ApolloError(`entity ${entityId} not found`, "NOT_FOUND");
      }
    } else if (entityProperties) {
      if (!entityTypeId && !entityTypeVersionId && !systemTypeName) {
        throw new UserInputError(
          "One of entityTypeId, entityTypeVersionId, or systemTypeName must be provided",
        );
      }
      // Create new entity
      entity = await Entity.create(
        client,
        createEntityArgsBuilder({
          accountId,
          createdById: user.entityId,
          entityTypeId,
          entityTypeVersionId,
          systemTypeName,
          properties: entityProperties,
          versioned: true,
        }),
      );
    } else {
      throw new Error(
        `One of entityId OR entityProperties and entityType must be provided`,
      );
    }

    const blockProperties: DbBlockProperties = {
      componentId,
      entityId: entity.entityId,
      accountId: entity.accountId,
    };

    const newBlock = await Entity.create(client, {
      accountId,
      systemTypeName: "Block",
      createdById: user.entityId,
      properties: blockProperties,
      versioned: true,
    });

    // Get and update the page.
    // @todo: always get the latest version for now. This is a temporary measure.
    // return here when strict vs. optimistic entity mutation question is resolved.
    const page = await Entity.getEntityLatestVersion(client, {
      accountId,
      entityId: pageEntityId,
    });
    if (!page) {
      const msg = `Page with fixed ID ${pageEntityId} not found in account ${accountId}`;
      throw new ApolloError(msg, "NOT_FOUND");
    }

    /** @todo: stop casting page.properties type */
    const position =
      args.position > (page.properties as DbPageProperties).contents.length
        ? (page.properties as DbPageProperties).contents.length
        : args.position;

    page.properties.contents = [
      ...(page.properties as DbPageProperties).contents.slice(0, position),
      {
        type: "Block",
        entityId: newBlock.entityId,
        accountId: newBlock.accountId,
      },
      ...(page.properties as DbPageProperties).contents.slice(position),
    ];

    await page.updateEntityProperties(client, page.properties);

    // TODO: for now, all entities are non-versioned, so the list array only have a single
    // element. Return when versioned entities are implemented at the API layer.
    return page.toGQLUnknownEntity();
  });
};
