import { GraphQLResolveInfo } from "graphql";

import { LinkedDataDefinition } from "../util";
import { Resolver, UnknownEntity } from "../../apiTypes.gen";
import { DbUnknownEntity } from "../../../types/dbTypes";
import { aggregateEntity } from "./aggregateEntity";
import { GraphQLContext } from "../../context";
import { isRecord } from "../../../util";
import { fileUrlResolver } from "../file/fileUrlResolver";

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
          .map((obj) => resolveLinkedData(ctx, parentAccountId, obj, info)),
      );
      continue;
    }

    if (isRecord(value)) {
      await resolveLinkedData(ctx, parentAccountId, value, info);
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
      await resolveLinkedData(ctx, entity.accountId, object.data, info);
    } else if (aggregate) {
      // Fetch an array of entities
      const { results, operation } = await aggregateEntity(
        {},
        {
          accountId: parentAccountId,
          entityTypeId,
          operation: aggregate,
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
   * Hacky way to implement a custom resolver for file entities. Because `UnknownEntity`
   * has properties as a `JsonObject`, we have to put this special code in the generic resolver
   * */
  // This avoids mutating the original, even if the above function does it should eventually be refactored not to
  const props = { ...entity.properties };
  if (props.key && props.contentMd5) {
    // "Detecting" that it's a file entity
    props.url = await fileUrlResolver(props, {}, ctx, info);
  }
  return props;
};
