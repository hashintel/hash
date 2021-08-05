import { genId } from "../../../util";
import { DbBlockProperties, DbPage } from "../../../types/dbTypes";
import { MutationCreatePageArgs, Resolver } from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";
import { createEntity } from "../entity";

export const createPage: Resolver<
  Promise<DbPage>,
  {},
  GraphQLContext,
  MutationCreatePageArgs
> = async (_, { accountId, properties }, ctx, info) => {
  const createdById = genId(); // TODO

  // Convenience wrapper
  const _createEntity = async (type: string, properties: any) => {
    return await createEntity(
      {},
      { accountId, createdById, type, properties, versioned: true },
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
  } as DbBlockProperties);

  const newParaEntity = await _createEntity("Text", { texts: [] });

  const newParaBlock = await _createEntity("Block", {
    componentId: "https://block.blockprotocol.org/paragraph",
    entityType: "Text",
    entityId: newParaEntity.id,
    accountId,
  } as DbBlockProperties);

  const page = await _createEntity("Page", {
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

  return page as DbPage;
};
