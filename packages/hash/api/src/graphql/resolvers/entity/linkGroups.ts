import jp from "jsonpath";
import {
  Resolver,
  Entity as GQLEntity,
  Link,
  LinkGroup,
} from "../../apiTypes.gen";
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
  srcEntityId: string,
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
                parseLinksFromPropertiesObject(client, arrayItem, srcEntityId, [
                  ...path,
                  key,
                  i,
                ]),
              ),
          ).then((nestedLinks) => nestedLinks.flat());
        }
        if (isRecord(value)) {
          if (
            key === "__linkedData" &&
            !(value as LinkedDataDefinition).aggregate
          ) {
            const {
              entityId: dstEntityId,
              entityVersionId: dstEntityVersionId,
            } = value as LinkedDataDefinition;

            if (!dstEntityId) {
              throw new Error(
                "Linked data is now requried to provide an entityId",
              );
            }

            /** @todo: stop looking up accountId */
            const [srcAccountId, dstAccountId] = await Promise.all([
              client.getEntityAccountId({ entityId: srcEntityId }),
              client.getEntityAccountId({ entityId: dstEntityId }),
            ]);

            const finalPathComponent = path[path.length - 1];

            return [
              {
                id: genId(),
                srcAccountId,
                srcEntityId,
                dstAccountId,
                dstEntityId,
                dstEntityVersionId,
                path: jp.stringify(
                  typeof finalPathComponent === "number"
                    ? path.slice(0, -1)
                    : path,
                ),
                index:
                  typeof finalPathComponent === "number"
                    ? finalPathComponent
                    : undefined,
              },
            ];
          } else {
            return parseLinksFromPropertiesObject(client, value, srcEntityId, [
              ...path,
              key,
            ]);
          }
        }

        return [];
      },
    ),
  ).then((nestedLinks) => nestedLinks.flat());

const doesLinkBelongInGroup =
  (sourceEntity: GQLEntity, link: Link) =>
  (linkGroup: LinkGroup): boolean =>
    sourceEntity.entityId === linkGroup.srcEntityId &&
    sourceEntity.entityVersionId === linkGroup.srcEntityVersionId &&
    link.path === linkGroup.path;

const mapLinkToLinkGroup = (
  sourceEntity: GQLEntity,
  link: Link,
): LinkGroup => ({
  srcEntityId: sourceEntity.entityId,
  srcEntityVersionId: sourceEntity.entityVersionId,
  path: link.path,
  links: [link],
});

export const linkGroups: Resolver<
  GQLEntity["linkGroups"],
  DbUnknownEntity,
  GraphQLContext
> = async (sourceEntity, _, { dataSources }) => {
  const parsedLinks = await parseLinksFromPropertiesObject(
    dataSources.db,
    sourceEntity.properties,
    sourceEntity.entityId,
  );

  return parsedLinks.reduce<LinkGroup[]>((prevLinkGroups, currentLink) => {
    const existingGroupIndex = prevLinkGroups.findIndex(
      doesLinkBelongInGroup(sourceEntity, currentLink),
    );

    return existingGroupIndex < 0
      ? [...prevLinkGroups, mapLinkToLinkGroup(sourceEntity, currentLink)]
      : [
          ...prevLinkGroups.slice(0, existingGroupIndex),
          {
            ...prevLinkGroups[existingGroupIndex],
            links: [...prevLinkGroups[existingGroupIndex].links, currentLink],
          },
          ...prevLinkGroups.slice(existingGroupIndex + 1),
        ];
  }, []);
};
