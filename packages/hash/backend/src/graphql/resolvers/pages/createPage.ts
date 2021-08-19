import { genId } from "../../../util";
import {
  MutationCreatePageArgs,
  Resolver,
  SystemTypeName,
} from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";
import { createEntity } from "../entity";
import { Entity } from "../../../db/adapter";
import { SystemType } from "../../../types/entityTypes";

export const createPage: Resolver<
  Promise<Entity>,
  {},
  GraphQLContext,
  MutationCreatePageArgs
> = async (_, { accountId, properties }, ctx, info) => {
  const createdById = genId(); // TODO

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
    entityType: "Header",
    entityId: newHeaderEntity.id,
    accountId,
  });

  const newParaEntity = await _createEntity("Text", { texts: [] });

  const newParaBlock = await _createEntity("Block", {
    componentId: "https://block.blockprotocol.org/paragraph",
    entityType: "Text",
    entityId: newParaEntity.id,
    accountId,
  });

  return _createEntity("Page", {
    title: properties.title,
    contents: [
      {
        entityId: newHeaderBlock.id,
        accountId,
      },
      {
        entityId: newParaBlock.id,
        accountId,
      },
    ],
  });
};
