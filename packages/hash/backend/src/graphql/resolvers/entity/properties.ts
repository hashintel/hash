import {
  AggregateOperationInput,
  Resolver,
  UnknownEntity,
} from "../../apiTypes.gen";
import { DbUnknownEntity } from "../../../types/dbTypes";
import { aggregateEntity } from "./aggregateEntity";
import { GraphQLContext } from "../../context";
import { GraphQLResolveInfo } from "graphql";

export const isRecord = (thing: unknown): thing is Record<string, any> => {
  if (typeof thing !== "object") {
    return false;
  }
  if (thing == null) {
    return false;
  }
  if (thing instanceof Array) {
    return false;
  }
  return true;
};

// Where a property needs to resolve to another object or objects of a type,
// that property should be expressed as this object under a __linkedData key
// e.g.
// properties: {
//   email: "c@hash.ai",
//   employer: { <-- will be resolved to the data requested in __linkedData
//     __linkedData: {
//       entityTypeId: "companyType1",
//       entityId: "c1"
//     }
//   }
// },
type LinkedDataDefinition = {
  aggregate?: AggregateOperationInput;
  entityTypeId?: string;
  entityId?: string;
};

// Recursively resolve any __linkedData fields in arbitrary entities
const resolveLinkedData = async (
  ctx: GraphQLContext,
  accountId: string,
  object: Record<string, any>,
  info: GraphQLResolveInfo
) => {
  if (!isRecord(object.properties)) {
    return;
  }
  for (const [key, value] of Object.entries(object.properties)) {
    if (Array.isArray(value)) {
      await Promise.all(
        value
          .flat(Infinity)
          .filter(isRecord)
          .map(
            async (obj) => await resolveLinkedData(ctx, accountId, obj, info)
          )
      );
      continue;
    }

    // We're only interested in properties which link to other data
    if (!isRecord(value) || !value.__linkedData) {
      continue;
    }

    const { aggregate, entityId, entityTypeId } =
      value.__linkedData as LinkedDataDefinition;

    // We need a type and one of an aggregation operation or id
    if (!entityTypeId || (!aggregate && !entityId)) {
      continue;
    }

    if (entityId) {
      // Fetch a single entity and resolve any linked data in it
      const entity = await ctx.dataSources.db.getEntity({
        accountId,
        entityVersionId: entityId,
      });
      if (!entity) {
        throw new Error(`entity ${entityId} in account ${accountId} not found`);
      }
      object.properties[key].data = entity
      // object.properties[key] = entity;
      await resolveLinkedData(
        ctx,
        entity.accountId,
        object.properties[key],
        info
      );
    } else if (aggregate) {
      // Fetch an array of entities
      const { results } = await aggregateEntity(
        {},
        {
          accountId,
          entityTypeId,
          operation: aggregate,
        },
        ctx,
        info
      );

      // object.properties[key] = results;
      object.properties[key].data = results
      // Resolve linked data for each entity in the array
      await Promise.all(
        object.properties[key].data.map((entity: DbUnknownEntity) => {
          return resolveLinkedData(ctx, entity.accountId, entity, info);
        })
      );
    }
  }
};

export const properties: Resolver<
  UnknownEntity["properties"],
  DbUnknownEntity,
  GraphQLContext
> = async (entity, _, ctx, info) => {
  await resolveLinkedData(ctx, entity.accountId, entity, info);
  return entity.properties;
};
