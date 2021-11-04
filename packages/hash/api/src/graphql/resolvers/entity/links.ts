import jp from "jsonpath";
import { Resolver, Entity as GQLEntity, Link } from "../../apiTypes.gen";
import { DbUnknownEntity } from "../../../types/dbTypes";
import { GraphQLContext } from "../../context";
import { isRecord, genId } from "../../../util";
import { LinkedDataDefinition } from "../util";
import { DBClient } from "../../../db";

/**
 * Temporary function for extracting outgoing links from an entity's
 * `properties` JSON blob.
 *
 * This function will be deprecated when the links are no longer stored
 * in an entity's `properties` JSON blob.
 */

export const parseLinksFromPropertiesObject = (
  client: DBClient,
  propertiesObject: any,
  sourceEntityId: string,
  path: jp.PathComponent[] = ["$"],
): Promise<Link[]> =>
  Promise.all(
    Object.entries(propertiesObject).map(
      async ([key, value]): Promise<Link[]> => {
        if (Array.isArray(value)) {
          return Promise.all(
            value
              .filter(isRecord)
              .map((arrayItem, i) =>
                parseLinksFromPropertiesObject(
                  client,
                  arrayItem,
                  sourceEntityId,
                  [...path, key, i],
                ),
              ),
          ).then((nestedLinks) => nestedLinks.flat());
        }
        if (isRecord(value)) {
          if (
            key === "__linkedData" &&
            !(value as LinkedDataDefinition).aggregate
          ) {
            const {
              entityId: destinationEntityId,
              entityVersionId: destinationEntityVersionId,
            } = value as LinkedDataDefinition;

            if (!destinationEntityId) {
              throw new Error(
                "Linked data is now requried to provide an entityId",
              );
            }

            /** @todo: stop looking up accountId */
            const [sourceAccountId, destinationAccountId] = await Promise.all([
              client.getEntityAccountId({ entityId: sourceEntityId }),
              client.getEntityAccountId({ entityId: destinationEntityId }),
            ]);

            return [
              {
                id: genId(),
                sourceAccountId,
                sourceEntityId,
                destinationAccountId,
                destinationEntityId,
                destinationEntityVersionId,
                path: jp.stringify(path),
              },
            ];
          } else {
            return parseLinksFromPropertiesObject(
              client,
              value,
              sourceEntityId,
              [...path, key],
            );
          }
        }

        return [];
      },
    ),
  ).then((nestedLinks) => nestedLinks.flat());

export const links: Resolver<
  GQLEntity["links"],
  DbUnknownEntity,
  GraphQLContext
> = async (entity, _, { dataSources }) => {
  const parsedLinks = await parseLinksFromPropertiesObject(
    dataSources.db,
    entity.properties,
    entity.entityId,
  );

  return parsedLinks;
};
