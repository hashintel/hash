import { ApolloError } from "apollo-server-express";
import { Entity, UnresolvedGQLEntity } from "../../../model";
import { DbBlockProperties } from "../../../types/dbTypes";

import { Resolver } from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";
import { resolveLinkedData } from "../entity/properties";

type LegacyTextProperties = {
  texts: {
    text: string;
    bold?: boolean;
    italics?: boolean;
    underline?: boolean;
  }[];
};

const isLegacyTextProperties = (properties: {
  texts?: unknown;
}): properties is LegacyTextProperties =>
  "texts" in properties && Array.isArray(properties.texts);

export const blockEntity: Resolver<
  Promise<UnresolvedGQLEntity>,
  DbBlockProperties,
  GraphQLContext
> = async ({ accountId, entityId }, _, ctx, info) => {
  const { dataSources } = ctx;
  const entity = await Entity.getEntityLatestVersion(dataSources.db, {
    accountId,
    entityId,
  });
  if (!entity) {
    throw new ApolloError(
      `Entity id ${entityId} not found in account ${accountId}`,
      "NOT_FOUND",
    );
  }

  const mappedEntity = entity.toGQLUnknownEntity();

  /**
   * We changed the shape of Text entity properties on 2021-11-04.
   * This was necessary to enable hard breaks and other custom tokens.
   *
   * Before: { texts: [{ text: "hello" }]}
   * After: { tokens: [{ tokenType: "text" text: "hello" }, { tokenType: "hardBreak" }]}
   *
   * Legacy data structure is converted on the fly to avoid disturbance in local development.
   * This code can be removed after 2022-01-01 – it is safe to assume that every dev has
   * reset their database at least one, so all properties have the new structure.
   */
  if (isLegacyTextProperties(mappedEntity.properties)) {
    const { texts, ...otherProperties } = mappedEntity.properties;
    mappedEntity.properties = {
      ...otherProperties,
      tokens: texts.map((legacyTextToken: any) => ({
        tokenType: "text",
        ...legacyTextToken,
      })),
    };
  }

  /**
   * `Block.entity` is typed in GraphQL as JSONData. This is because
   * Entity.properties (in some cases) is typed as JSONData too, which can
   * contain entities, which will then by typed as JSONData, which means if we
   * want the frontend to be able to treat these equally, we'll want
   * Block.entity to be JSONData. However, this means any Entity.* custom
   * resolvers won't be triggered for properties on Block.entity. This means
   * we need to manually resolve any links contained within the entity.
   */
  await resolveLinkedData(ctx, entity.accountId, entity.properties, info);

  return mappedEntity;
};
