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
  // @todo: generate all of the entity IDs up-front and create all entities below
  // concurrently (may need to defer FK constraints).

  // Convenience wrapper
  const _createEntity = async (type: SystemType, entityProperties: any) => {
    return await createEntity(
      {},
      {
        accountId,
        entity: {
          entityProperties,
          versioned: true,
          entityType: {
            systemTypeName: SystemTypeName[type],
          },
        },
      },
      ctx,
      info,
    );
  };

  const newParaEntity = await _createEntity("Text", { tokens: [] });

  const newParaBlock = await _createEntity("Block", {
    componentId: "https://block.blockprotocol.org/paragraph",
    entityId: newParaEntity.entityId,
    accountId,
  });

  return _createEntity("Page", {
    title: properties.title,
    contents: [
      {
        entityId: newParaBlock.entityId,
        accountId,
      },
    ],
  });
};
