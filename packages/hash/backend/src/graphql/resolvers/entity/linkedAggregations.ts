import jp from "jsonpath";
import { UnresolvedGQLEntity } from "../../../model";
import {
  Resolver,
  LinkedAggregation,
  AggregateOperationInput,
} from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";
import { LinkedDataDefinition } from "../util";
import { isRecord } from "../../../util";
import { aggregateEntity } from ".";
import { DbUnknownEntity } from "../../../types/dbTypes";

/**
 * Temporary function for extracting aggregations from the __linkedData
 * fields in an entity's `properties` JSON blob.
 *
 * This function will be deprecated when links are no longer stored
 * in an entity's `properties` JSON blob.
 */

export const parseAggregationsFromPropertiesObject = (
  propertiesObject: any,
  path: jp.PathComponent[] = ["$"],
): {
  entityTypeId: string;
  operationInput: AggregateOperationInput;
  path: string;
}[] =>
  Object.entries(propertiesObject)
    .map(
      ([key, value]): {
        entityTypeId: string;
        operationInput: AggregateOperationInput;
        path: string;
      }[] => {
        if (Array.isArray(value)) {
          return value
            .filter(isRecord)
            .map((arrayItem, i) =>
              parseAggregationsFromPropertiesObject(arrayItem, [
                ...path,
                key,
                i,
              ]),
            )
            .flat();
        }
        if (isRecord(value)) {
          if (key === "__linkedData") {
            const { entityTypeId, aggregate: operationInput } =
              value as LinkedDataDefinition;

            if (entityTypeId && operationInput) {
              return [
                { entityTypeId, operationInput, path: jp.stringify(path) },
              ];
            }
          } else {
            return parseAggregationsFromPropertiesObject(value, [...path, key]);
          }
        }

        return [];
      },
    )
    .flat();

type UnresolvedLinkedAggregationResponse = Omit<
  LinkedAggregation,
  "results"
> & {
  results: UnresolvedGQLEntity[];
};

export const linkedAggregations: Resolver<
  Promise<UnresolvedLinkedAggregationResponse[]>,
  DbUnknownEntity,
  GraphQLContext
> = (entity, _, ctx, info) => {
  // Temporarily obtain links by parsing the entity's properties object
  const parsedAggregations = parseAggregationsFromPropertiesObject(
    entity.properties,
  );

  const { accountId } = entity;

  return Promise.all(
    parsedAggregations.map(async ({ entityTypeId, operationInput, path }) => {
      const { operation, results } = await aggregateEntity(
        {},
        { accountId, entityTypeId, operation: operationInput },
        ctx,
        info,
      );

      return { operation, results, path };
    }),
  );
};
