import { ApolloError } from "apollo-server-errors";
import { Resolver } from "../../apiTypes.gen";
import { DbUnknownEntity } from "../../../types/dbTypes";
import { GraphQLContext } from "../../context";
import { parseLinksFromPropertiesObject } from "./links";
import { Entity, UnresolvedGQLUnknownEntity } from "../../../model";

export const linkedEntities: Resolver<
  Promise<UnresolvedGQLUnknownEntity[]>,
  DbUnknownEntity,
  GraphQLContext
> = async (entity, _, { dataSources }) => {
  const { db } = dataSources;

  // Temporarily obtain links by parsing the entity's properties object
  const parsedLinks = await parseLinksFromPropertiesObject(
    dataSources.db,
    entity.properties,
    entity.entityId,
  );

  return Promise.all(
    parsedLinks
      .map(
        ({
          destinationAccountId,
          destinationEntityId,
          destinationEntityVersionId,
        }) => ({
          accountId: destinationAccountId,
          entityId: destinationEntityId,
          entityVersionId: destinationEntityVersionId || undefined,
        }),
      )
      // Remove duplicates
      .filter(
        (link, i, allLinks) =>
          allLinks.findIndex(({ entityId }) => link.entityId === entityId) ===
          i,
      )
      .map(async ({ accountId, entityId, entityVersionId }) => {
        const linkedEntity = entityVersionId
          ? await Entity.getEntity(db, {
              accountId,
              entityVersionId,
            })
          : await Entity.getEntityLatestVersion(db, {
              accountId,
              entityId,
            });

        if (!linkedEntity) {
          throw new ApolloError(
            `linked entity ${entityId} not found in account ${accountId}`,
            "NOT_FOUND",
          );
        }

        return linkedEntity.toGQLUnknownEntity();
      }),
  );
};
