import { cloneDeep } from "lodash";
import { ApolloError } from "apollo-server-express";

import {
  Resolver,
  ImpliedEntityHistory,
  ImpliedEntityVersion,
  QueryGetImpliedEntityHistoryArgs,
  QueryGetImpliedEntityVersionArgs,
} from "../../apiTypes.gen";
import { LinkedDataDefinition } from "../util";
import { GraphQLContext } from "../../context";
import { genId, topologicalSort, isRecord } from "../../../util";
import { UnresolvedGQLEntity, Entity } from "../../../model";
import { DbAdapter } from "../../../db";
import {
  Graph,
  DbEntity,
  // DbPageProperties,
  // DbBlockProperties,
} from "../../../db/adapter";
import { dbAggregateEntity } from "./aggregateEntity";

/**
 * IMPORTANT NOTE: the implementation of the implied history resolver
 * is currently broken due to changes that were made in the way we store
 * links between entities in the datastore. This will be rectified in an
 * upcoming task.
 */

/**
 * An identifier used as a key in the cache for identifying an implied version
 * of an entity.
 * */
const impliedVersionKey = (params: {
  accountId: string;
  entityId: string;
  createdAt: Date;
}) => {
  const time = params.createdAt.getTime().toString();
  return `${params.accountId}-${params.entityId}-${time}`;
};

/** Find a link in a graph. */
const findLink = (params: {
  graph: Graph;
  sourceEntityVersionId: string;
  destinationEntityId: string;
  fixed: boolean;
}) => {
  return params.graph.links.find(
    ({ src, dst, fixed }) =>
      src.entityVersionId === params.sourceEntityVersionId &&
      dst.entityId === params.destinationEntityId &&
      fixed === params.fixed,
  );
};

export const getImpliedEntityHistory: Resolver<
  Promise<ImpliedEntityHistory>,
  {},
  GraphQLContext,
  QueryGetImpliedEntityHistoryArgs
> = async (_, { accountId, entityId }, { dataSources }) => {
  const { db, cache } = dataSources;
  const graphs = await db.getImpliedEntityHistory({
    accountId,
    entityId,
  });

  const impliedVersions: ImpliedEntityVersion[] = graphs.map((graph) => ({
    createdAt: graph.entities
      .map((ver) => ver.updatedAt)
      .reduce((acc, time) => (acc < time ? acc : time))
      .toISOString(),
  }));

  const history: ImpliedEntityHistory = {
    timelineId: genId(),
    timeline: impliedVersions,
  };

  // Cache each implied version graph so that we may retrieve it if the client requests
  // it later.
  // @todo: should set a TTL on cached items
  await Promise.all(
    impliedVersions.map(({ createdAt }, i) =>
      cache.set(
        impliedVersionKey({
          accountId,
          entityId,
          createdAt: new Date(createdAt),
        }),
        JSON.stringify(graphs[i]),
      ),
    ),
  );

  // Cache the implied history timeline as a list.
  await cache.rpush(
    history.timelineId,
    ...history.timeline.map((ver) => JSON.stringify(ver)),
  );

  return history;
};

/** Recursively "hydrate", i.e. insert the entities linked by __linkedData, in an
 * entity's properties.
 */
const hydrateEntity = async (
  db: DbAdapter,
  entity: DbEntity,
  graph: Graph,
  versionIdEntityMap: Map<string, DbEntity>,
): Promise<void> => {
  const stack: Record<string, any>[] = [entity.properties];

  const hydrateArray = (arr: any[]) => stack.push(...arr);

  const hydrateAggregate = async (record: Record<string, any>) => {
    // @todo -- how should we handle aggregations in implied history? Currently,
    // aggregations are configured for the current state of the graph only
    const ld = record.__linkedData! as LinkedDataDefinition;
    const { results, operation } = await dbAggregateEntity(db)({
      accountId: entity.accountId,
      operation: { entityTypeId: ld.entityTypeId!, ...ld.aggregate },
    });
    // eslint-disable-next-line no-param-reassign
    record.data = results;
    // eslint-disable-next-line no-param-reassign
    record.__linkedData.aggregate = {
      ...record.__linkedData.aggregate,
      ...operation,
    };
  };

  const hydrateLinkedEntity = (record: Record<string, any>) => {
    const ld = record.__linkedData! as LinkedDataDefinition;
    if (!ld.entityId) {
      throw Error("__linkedData is missing field 'entityId'");
    }
    if (ld.entityVersionId) {
      return versionIdEntityMap.get(ld.entityVersionId)!;
    }
    const link = findLink({
      graph,
      sourceEntityVersionId: entity.entityVersionId,
      destinationEntityId: ld.entityId,
      fixed: false,
    })!;
    const linkedEntity = versionIdEntityMap.get(link.dst.entityVersionId)!;
    // eslint-disable-next-line no-param-reassign
    record.data = linkedEntity;
  };

  const hydrateRecord = async (record: Record<string, any>) => {
    for (const [key, value] of record.entries()) {
      if (Array.isArray(value)) {
        hydrateArray(value);
      } else if (key === "__linkedData") {
        const ld = value as LinkedDataDefinition;
        if (ld.aggregate) {
          await hydrateAggregate(record);
        } else {
          hydrateLinkedEntity(record);
        }
      } else if (isRecord(value)) {
        stack.push(value);
      }
    }
  };

  while (stack.length > 0) {
    await hydrateRecord(stack.pop()!);
  }
};

/** Temporarily commenting out broken code

// Pages are a special case which do not use __linkedData. The links to the blocks are
// contained in its "contents" array property.
// @todo: can use `hydrateEntity` when Page links are made consistent with other entity
// types
const hydratePageEntity = (
  page: DbEntity,
  graph: Graph,
  versionIdEntityMap: Map<string, DbEntity>,
) => {
  const pageProps = page.properties as DbPageProperties;
  // Hydrate each block in the page's "contents" property
  const blocks: DbEntity[] = pageProps.contents.map((content) => {
    const blkLink = findLink({
      graph,
      sourceEntityVersionId: page.entityVersionId,
      destinationEntityId: content.entityId,
      fixed: false,
    })!;
    const block = versionIdEntityMap.get(blkLink.dst.entityVersionId)!;

    // Hydrate the link that the block makes through its "entityId" property
    const blkProps = block.properties as DbBlockProperties;
    const entityLink = findLink({
      graph,
      sourceEntityVersionId: block.entityVersionId,
      destinationEntityId: blkProps.entityId,
      fixed: false,
    })!;
    const entity = versionIdEntityMap.get(entityLink.dst.entityVersionId);
    block.properties.entity = entity;

    return block;
  });

  // Update the page's "contents" property with the hydrated blocks.
  // eslint-disable-next-line no-param-reassign
  page.properties.contents = blocks;
};


 */

/**
 * @todo: function assumes that the sub-graph rooted at `rootEntityVersionId` is acyclic.
 * What should we do for cyclic graphs?
 */
const hydrateRootSubgraph = async (
  db: DbAdapter,
  rootEntityVersionId: string,
  graph: Graph,
  entities: DbEntity[],
): Promise<DbEntity> => {
  const entityVersionIdEntityMap = new Map<string, DbEntity>();
  for (const entity of entities) {
    // Make a deep copy of each un-hydrated entity because we will be mutating them
    // in this function.
    entityVersionIdEntityMap.set(entity.entityVersionId, cloneDeep(entity));
  }

  // Hydrate each entity in the sub-graph in reverse-topological order to eliminate
  // duplicate work.
  const sortedEntityVersionIds = topologicalSort(
    graph.links.map(({ src, dst }): [string, string] => [
      src.entityVersionId,
      dst.entityVersionId,
    ]),
  ).reverse();

  for (const entityVersionId of sortedEntityVersionIds) {
    const entity = entityVersionIdEntityMap.get(entityVersionId)!;
    if (entity.entityTypeName === "Page") {
      // hydratePageEntity(entity, graph, entityVersionIdEntityMap);
    } else {
      await hydrateEntity(db, entity, graph, entityVersionIdEntityMap);
    }
  }

  return entityVersionIdEntityMap.get(rootEntityVersionId)!;
};

export const getImpliedEntityVersion: Resolver<
  Promise<UnresolvedGQLEntity>,
  {},
  GraphQLContext,
  QueryGetImpliedEntityVersionArgs
> = async (
  _,
  { accountId, entityId, impliedVersionCreatedAt },
  { dataSources },
) => {
  const { db, cache } = dataSources;

  // Get the implied version graph from the cache
  const graphStr = await cache.get(
    impliedVersionKey({
      accountId,
      entityId,
      createdAt: new Date(impliedVersionCreatedAt),
    }),
  );
  if (!graphStr) {
    throw new ApolloError(
      `implied version for entity ${entityId} with createdAt time ${impliedVersionCreatedAt} does not exist`,
      "NOT_FOUND",
    );
  }
  const graph = JSON.parse(graphStr) as Graph;

  // Get all entities in the graph
  const entities = await db.getEntities(graph.entities);

  // Hydrate the root entity in the graph
  const root = entities.find(
    (entity) => entity.entityVersionId === graph.rootEntityVersionId,
  )!;
  const hydratedRoot = await hydrateRootSubgraph(
    db,
    root.entityVersionId,
    graph,
    entities,
  );

  return new Entity(hydratedRoot).toGQLUnknownEntity();
};
