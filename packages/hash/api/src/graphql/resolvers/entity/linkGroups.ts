import { ApolloError } from "apollo-server-errors";
import { Resolver, Entity as GQLEntity, LinkGroup } from "../../apiTypes.gen";
import { DbUnknownEntity } from "../../../types/dbTypes";
import { GraphQLContext } from "../../context";
import { Entity, Link } from "../../../model";

const doesLinkBelongInGroup =
  (sourceEntity: GQLEntity, link: Link) =>
  (linkGroup: LinkGroup): boolean =>
    sourceEntity.entityId === linkGroup.sourceEntityId &&
    sourceEntity.entityVersionId === linkGroup.sourceEntityVersionId &&
    link.stringifiedPath === linkGroup.path;

const mapLinkToLinkGroup = (
  sourceEntity: GQLEntity,
  link: Link,
): LinkGroup => ({
  sourceEntityId: sourceEntity.entityId,
  sourceEntityVersionId: sourceEntity.entityVersionId,
  path: link.stringifiedPath,
  links: [link.toUnresolvedGQLLink()],
});

export const linkGroups: Resolver<
  GQLEntity["linkGroups"],
  DbUnknownEntity,
  GraphQLContext
> = async (sourceEntity, _, { dataSources }) => {
  const source = await Entity.getEntity(dataSources.db, {
    accountId: sourceEntity.accountId,
    entityVersionId: sourceEntity.entityVersionId,
  });

  if (!source) {
    const msg = `entity with version ID ${sourceEntity.entityVersionId} not found in account ${sourceEntity.accountId}`;
    throw new ApolloError(msg, "NOT_FOUND");
  }

  /** @todo: resolve multiple layers of outgoing links */

  const outgoingLinks = await source.getOutgoingLinks(dataSources.db);

  /** @todo: use a more efficient data-structure to produce `outgoingLinks` (https://github.com/hashintel/dev/pull/341#discussion_r746635315) */
  return outgoingLinks.reduce<LinkGroup[]>((prevLinkGroups, currentLink) => {
    const existingGroupIndex = prevLinkGroups.findIndex(
      doesLinkBelongInGroup(sourceEntity, currentLink),
    );

    return existingGroupIndex < 0
      ? [...prevLinkGroups, mapLinkToLinkGroup(sourceEntity, currentLink)]
      : [
          ...prevLinkGroups.slice(0, existingGroupIndex),
          {
            ...prevLinkGroups[existingGroupIndex],
            links: [
              ...prevLinkGroups[existingGroupIndex].links,
              currentLink.toUnresolvedGQLLink(),
            ],
          },
          ...prevLinkGroups.slice(existingGroupIndex + 1),
        ];
  }, []);
};
