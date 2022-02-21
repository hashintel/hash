import {
  MutationCreatePageArgs,
  Resolver,
  SystemTypeName,
} from "../../apiTypes.gen";
import { LoggedInGraphQLContext } from "../../context";
import { SystemType } from "../../../types/entityTypes";
import { Entity, UnresolvedGQLEntity } from "../../../model";

export const createPage: Resolver<
  Promise<UnresolvedGQLEntity>,
  {},
  LoggedInGraphQLContext,
  MutationCreatePageArgs
> = async (_, { accountId, properties }, { dataSources: { db }, user }) => {
  // @todo: generate all of the entity IDs up-front and create all entities below
  // concurrently (may need to defer FK constraints).

  // Convenience wrapper
  const createEntity = async (type: SystemType, entityProperties: any) => {
    return await Entity.createEntityWithLinks(db, {
      user,
      accountId,
      entityDefinition: {
        entityProperties,
        versioned: true,
        entityType: {
          systemTypeName: SystemTypeName[type],
        },
      },
    });
  };

  const newParaEntity = await createEntity("Text", { tokens: [] });

  const newParaBlock = await createEntity("Block", {
    componentId: "https://blockprotocol.org/blocks/@hash/paragraph",
    entityId: newParaEntity.entityId,
    accountId,
  });

  return (
    await createEntity("Page", {
      title: properties.title,
      contents: [
        {
          entityId: newParaBlock.entityId,
          accountId,
        },
      ],
    })
  ).toGQLUnknownEntity();
};
