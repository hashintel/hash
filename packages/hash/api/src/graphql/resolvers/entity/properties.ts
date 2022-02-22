import { GraphQLResolveInfo } from "graphql";
import { DbUnknownEntity } from "../../../db/adapter";

import { Block, File, Page } from "../../../model";
import { isRecord } from "../../../util";
import { Resolver, UnknownEntity, FileProperties } from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";
import { fileUrlResolver } from "../file/fileUrlResolver";

import { LinkedDataDefinition } from "../util";
import { aggregateEntity } from "./aggregateEntity";

/* eslint-disable no-param-reassign */

/**
 * @todo: refactor resolveLinkedData to return updated record object
 * instead of mutating it directly, to better adhere to functional
 * programming best-practices, and so that no-param-reassign can
 * be turned back on
 */

// Recursively resolve any __linkedData fields in arbitrary entities
export const resolveLinkedData = async (
  ctx: GraphQLContext,
  parentAccountId: string,
  object: Record<string, any>,
  info: GraphQLResolveInfo,
  resolvedEntities: { entityId: string; entityVersionId: string }[] = [],
) => {
  const db = ctx.dataSources.db;
  if (!isRecord(object)) {
    return;
  }

  for (const [key, value] of Object.entries(object)) {
    if (Array.isArray(value)) {
      await Promise.all(
        value
          .flat(Infinity)
          .filter(isRecord)
          .map((obj) =>
            resolveLinkedData(
              ctx,
              parentAccountId,
              obj,
              info,
              resolvedEntities,
            ),
          ),
      );
      continue;
    }

    if (isRecord(value)) {
      await resolveLinkedData(
        ctx,
        parentAccountId,
        value,
        info,
        resolvedEntities,
      );
    }

    // We're only interested in properties which link to other data
    if (key !== "__linkedData" || !isRecord(value)) {
      continue;
    }

    const { aggregate, entityId, entityVersionId, entityTypeId } =
      value as LinkedDataDefinition;

    // We need a type and one of an aggregation operation or id
    if (!entityTypeId || (!aggregate && !entityId)) {
      continue;
    }

    if (entityId || entityVersionId) {
      if (!entityId) {
        throw new Error('__linkedData field "entityId" must be provided.');
      }
      // Fetch a single entity and resolve any linked data in it
      const accountId = await db.getEntityAccountId({
        entityId,
        entityVersionId,
      });
      const entity = entityVersionId
        ? await db.getEntity({ accountId, entityVersionId })
        : await db.getEntityLatestVersion({ accountId, entityId });
      if (!entity) {
        throw new Error(`entity ${entityId} in account ${accountId} not found`);
      }
      object.data = entity;
      if (
        resolvedEntities.find(
          (resolvedEntity) =>
            resolvedEntity.entityVersionId === entity.entityVersionId &&
            resolvedEntity.entityId === entity.entityId,
        ) === undefined
      ) {
        await resolveLinkedData(ctx, entity.accountId, object.data, info, [
          ...resolvedEntities,
          {
            entityId: entity.entityId,
            entityVersionId: entity.entityVersionId,
          },
        ]);
      }
    } else if (aggregate) {
      // Fetch an array of entities
      const { results, operation } = await aggregateEntity(
        {},
        {
          accountId: parentAccountId,
          operation: { ...aggregate, entityTypeId },
        },
        ctx,
        info,
      );

      object.data = results;
      object.__linkedData.aggregate = {
        ...object.__linkedData.aggregate,
        ...operation,
      };
      // Resolve linked data for each entity in the array
      await Promise.all(
        object.data.map((entity: DbUnknownEntity) => {
          return resolveLinkedData(ctx, entity.accountId, entity, info);
        }),
      );
    }
  }
};

export const properties: Resolver<
  UnknownEntity["properties"],
  DbUnknownEntity,
  GraphQLContext
> = async (entity, _, ctx, info) => {
  await resolveLinkedData(ctx, entity.accountId, entity.properties, info);
  /**
   * Hacky way to implement a custom resolver for file entities. Because
   * `UnknownEntity` has properties as a `JsonObject`, we have to put this
   * special code in the generic resolver
   * */
  // This avoids mutating the original, even if the above function does it should eventually be refactored not to
  const entityProperties = { ...entity.properties };

  const { dataSources } = ctx;
  const { db } = dataSources;

  /**
   * If this resolver needs more of these cases, it would be preferable to delegate the the logic away from here.
   */
  if (entity.entityTypeId === (await File.getEntityType(db)).entityId) {
    // Since the type of tne entityTypeId equals the DB's File system type entityId
    // this assumption would hold true.
    // Props is a reference here with a type assertion, modifications will mutate `props`
    const fileProps = entityProperties as FileProperties;
    fileProps.url = await fileUrlResolver(fileProps, {}, ctx, info);
  } else if (entity.entityTypeId === (await Page.getEntityType(db)).entityId) {
    /** @todo: deprecate this when API consumers stop accessing `properties.contents` of a Page */

    const page = await Page.getPageById(db, entity);
    entityProperties.contents = (await page!.getBlocks(db)).map((block) =>
      block.toGQLUnknownEntity(),
    );
  } else if (entity.entityTypeId === (await Block.getEntityType(db)).entityId) {
    /**
     * @todo: deprecate this when API consumers stop accessing `properties.entity`,
     * `properties.entityId` and `properties.accountId` of a Block
     */

    const block = await Block.getBlockById(db, entity);
    const blockData = await block!.getBlockData(db);

    entityProperties.accountId = blockData.accountId;
    entityProperties.entityId = blockData.entityId;
    entityProperties.entity = blockData.toGQLUnknownEntity();
  }
  return entityProperties;
};
