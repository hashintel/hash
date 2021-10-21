import {
  MutationCreatePageArgs,
  Resolver,
  SystemTypeName,
} from "../../apiTypes.gen";
import { LoggedInGraphQLContext } from "../../context";
import { createEntity } from "../entity";
import { SystemType } from "../../../types/entityTypes";
import { UnresolvedGQLEntity } from "../../../model";

export const createPage: Resolver<
  Promise<UnresolvedGQLEntity>,
  {},
  LoggedInGraphQLContext,
  MutationCreatePageArgs
> = async (_, { accountId, properties }, ctx, info) => {
  const { user } = ctx;
  const createdById = user.entityId;

  // @todo: generate all of the entity IDs up-front and create all entities below
  // concurrently (may need to defer FK constraints).

  // Convenience wrapper
  const _createEntity = async (type: SystemType, entityProperties: any) => {
    return await createEntity(
      {},
      {
        accountId,
        createdById,
        systemTypeName: SystemTypeName[type],
        properties: entityProperties,
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
    entityId: newHeaderEntity.entityId,
    accountId,
  });

  const newParaEntity = await _createEntity("Text", { texts: [] });

  const newParaBlock = await _createEntity("Block", {
    componentId: "https://block.blockprotocol.org/paragraph",
    entityId: newParaEntity.entityId,
    accountId,
  });

  return _createEntity("Page", {
    title: properties.title,
    contents: [
      {
        entityId: newHeaderBlock.entityId,
        accountId,
      },
      {
        entityId: newParaBlock.entityId,
        accountId,
      },
    ],
  });
};
