import { Resolver, Entity as GQLEntity, Link } from "../../apiTypes.gen";
import { DbUnknownEntity } from "../../../types/dbTypes";
import { GraphQLContext } from "../../context";
import { isRecord, genId } from "../../../util";
import { LinkedDataDefinition } from "../util";

/**
 * Temporary function for extracting outgoing links from an entity's
 * `properties` JSON blob.
 * 
 * This function will be deprecated when the links are no longer stored
 * in an entity's `properties` JSON blob.
 */

const parseLinksFromPropertiesObject = (
  propertiesObject: any,
  entityId: string,
  path: string
): Link[] =>
  Object.entries(propertiesObject)
    .map(([key, value]): Link[] => {
      if (typeof value === "object" && Array.isArray(value)) {
        return value
          .filter((arrayItem) => typeof arrayItem === "object")
          .map((arrayItem, i) =>
            parseLinksFromPropertiesObject(
              arrayItem,
              entityId,
              `${path}${path ? "." : ""}${key}[${i}]`
            )
          )
          .flat();
      }
      if (isRecord(value)) {
        if (key === "__linkedData") {
          const {
            entityId: destinationEntityId,
            entityVersionId: destinationEntityVersionId,
          } = value as LinkedDataDefinition;

          return [
            {
              id: genId(),
              sourceEntityId: entityId,
              destinationEntityId,
              destinationEntityVersionId,
              path,
            },
          ];
        } else {
          return parseLinksFromPropertiesObject(
            value,
            entityId,
            `${path}${path ? "." : ""}${key}`
          );
        }
      }

      return [];
    })
    .flat();

export const links: Resolver<
  GQLEntity["links"],
  DbUnknownEntity,
  GraphQLContext
> = async (entity) => {
  const parsedLinks = parseLinksFromPropertiesObject(
    entity.properties,
    entity.entityId,
    ""
  );

  return parsedLinks;
};
