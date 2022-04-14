import { ApolloError } from "apollo-server-errors";
import { set } from "lodash";
import { Resolver, Entity as GQLEntity, LinkGroup } from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";
import { Entity, Link } from "../../../model";
import { DbClient } from "../../../db";
import { DbUnknownEntity } from "../../../db/adapter";

export const DEFAULT_LINK_DEPTH = 2;

export const DEFAULT_AGGREGATE_LINK_DEPTH = 1;

/**
 * Data structure for collecting the outgoing links
 */
type LinkGroupsObject = {
  [sourceEntityId: string]: {
    [sourceEntityVersionId: string]: {
      [stringifiedPath: string]: Link[];
    };
  };
};

/**
 * @returns true if linkA and linkB have the same destination entity (with the same specificed version)
 */
export const linkHasSameDestinationAs = (linkA: Link) => (linkB: Link) =>
  linkA.destinationEntityId === linkB.destinationEntityId &&
  linkA.destinationEntityVersionId === linkB.destinationEntityVersionId;

/**
 * Adds the outgoing links to the provided linkGroups object
 * @param linkGroupsObject the linkGroups object where the resulting links are added
 * @param depth the depth of outgoing links to add.
 */
const addEntityOutgoingLinks =
  (client: DbClient, linkGroupsObject: LinkGroupsObject, depth: number) =>
  async (entity: Entity) => {
    const existingGroups =
      linkGroupsObject?.[entity.entityId]?.[entity.entityVersionId];

    let outgoingLinks: Link[];

    if (existingGroups) {
      outgoingLinks = Object.values(existingGroups).flat();
    } else {
      outgoingLinks = await entity.getOutgoingLinks(client);

      const { entityId, entityVersionId } = entity;

      for (const outgoingLink of outgoingLinks) {
        const { stringifiedPath } = outgoingLink;

        const existingLinks =
          linkGroupsObject?.[entityId]?.[entityVersionId]?.[stringifiedPath];

        set(
          linkGroupsObject,
          [entityId, entityVersionId, stringifiedPath],
          (existingLinks ?? []).concat([outgoingLink]),
        );
      }
    }

    if (depth > 1) {
      const destinationEntities = await Promise.all(
        outgoingLinks
          .filter(
            (outgoingLink, i, allOutgoingLinks) =>
              allOutgoingLinks.findIndex(
                linkHasSameDestinationAs(outgoingLink),
              ) === i,
          )
          .map((link) => link.getDestination(client)),
      );

      await Promise.all(
        destinationEntities.map(
          addEntityOutgoingLinks(client, linkGroupsObject, depth - 1),
        ),
      );
    }
  };

/**
 * Adds the outgoing links of the aggregation results of an entity to the provided linkGroups object
 */
const addEntityAggregationResultOutgoingLinks =
  (client: DbClient, linkGroups: LinkGroupsObject) =>
  async (entity: Entity) => {
    const aggregations = await entity.getAggregations(client);

    const aggregationResults = await Promise.all(
      aggregations.map((aggregation) => aggregation.getResults(client)),
    );

    const allAggregationResults = aggregationResults
      .flat()
      // filter duplicate resulting entities
      .filter((result, i, all) => {
        return (
          all.findIndex((resultEntity) =>
            resultEntity.isEquivalentTo(result),
          ) === i
        );
      });

    await Promise.all(
      allAggregationResults.map(
        addEntityOutgoingLinks(
          client,
          linkGroups,
          DEFAULT_AGGREGATE_LINK_DEPTH,
        ),
      ),
    );
  };

/**
 * Creates a linkGroups object for a provided entity
 */
export const generateEntityLinkGroupsObject = async (
  client: DbClient,
  entity: Entity,
): Promise<LinkGroupsObject> => {
  const linkGroupsObj: LinkGroupsObject = {};

  await addEntityOutgoingLinks(
    client,
    linkGroupsObj,
    /** @todo: obtain this as a GQL argument? */
    DEFAULT_LINK_DEPTH,
  )(entity);

  await addEntityAggregationResultOutgoingLinks(client, linkGroupsObj)(entity);

  return linkGroupsObj;
};

const mapLinkGroupsObjectToGQLLinkGroups = (
  linkGroupsObj: LinkGroupsObject,
): LinkGroup[] =>
  Object.entries(linkGroupsObj)
    .map(([sourceEntityId, linkGroupsObjBySourceEntityId]) =>
      Object.entries(linkGroupsObjBySourceEntityId).map(
        ([sourceEntityVersionId, linkGroupsObjBySourceEntityVersionId]) =>
          Object.entries(linkGroupsObjBySourceEntityVersionId).map(
            ([path, links]): LinkGroup => ({
              sourceEntityId,
              sourceEntityVersionId,
              path,
              links: links.map((link) => link.toUnresolvedGQLLink()),
            }),
          ),
      ),
    )
    .flat(2);

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

  const linkGroupsObject = await generateEntityLinkGroupsObject(
    dataSources.db,
    source,
  );

  return mapLinkGroupsObjectToGQLLinkGroups(linkGroupsObject);
};
