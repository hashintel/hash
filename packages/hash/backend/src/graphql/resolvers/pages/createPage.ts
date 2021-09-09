import {
  MutationCreatePageArgs,
  Resolver,
  SystemTypeName,
} from "../../apiTypes.gen";
import { LoggedInGraphQLContext } from "../../context";
import { createEntity } from "../entity";
import { SystemType } from "../../../types/entityTypes";
import { EntityWithIncompleteEntityType } from "../../../model";

export const createPage: Resolver<
  Promise<EntityWithIncompleteEntityType>,
  {},
  LoggedInGraphQLContext,
  MutationCreatePageArgs
> = async (_, { accountId, properties }, ctx, info) => {
  const { user } = ctx;
  const createdById = user.entityId;

  // Convenience wrapper
  const _createEntity = async (type: SystemType, properties: any) => {
    return await createEntity(
      {},
      {
        accountId,
        createdById,
        systemTypeName: SystemTypeName[type],
        properties,
        versioned: true,
      },
      ctx,
      info
    );
  };

  const newHeaderEntity = await _createEntity("Text", {
    texts: [{ text: properties.title, bold: true }],
  });

  const newHeaderBlock = await _createEntity("Block", {
    componentId: "https://block.blockprotocol.org/header",
    entityId: newHeaderEntity.entityVersionId,
    accountId,
  });

  const newParaEntity = await _createEntity("Text", { texts: [] });

  const newParaBlock = await _createEntity("Block", {
    componentId: "https://block.blockprotocol.org/paragraph",
    entityId: newParaEntity.entityVersionId,
    accountId,
  });

  return _createEntity("Page", {
    title: properties.title,
    contents: [
      {
        entityId: newHeaderBlock.entityVersionId,
        accountId,
      },
      {
        entityId: newParaBlock.entityVersionId,
        accountId,
      },
    ],
  });
};
