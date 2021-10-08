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
import { EntityWithIncompleteEntityType, Entity } from "../../../model";
import { Graph, Entity as DbEntity } from "../../../db/adapter";
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
      .map((ver) => ver.createdAt)
      .reduce((acc, time) => (acc < time ? acc : time)),
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
        impliedVersionKey({ accountId, entityId, createdAt }),
        JSON.stringify(graphs[i])
      )
    )
  );

  // Cache the implied history timeline as a list.
  await cache.rpush(
    history.timelineId,
    ...history.timeline.map((ver) => JSON.stringify(ver))
  );

  return history;
};

const hydrateEntity = (
  entity: DbEntity,
  graph: Graph,
  versionIdEntityMap: Map<string, DbEntity>
): void => {
  const stack = [entity.properties];

  const hydrateArray = (arr: unknown[]) => stack.push(...arr);

  const hydrateAggregate = (_agg: AggregateOperationInput) => {
    // @todo -- how should we handle aggregations in implied history?
    // Currently, aggregations are configured for the current state of the graph only
    return null;
  };

  const hydrateLinkedData = (ld: LinkedDataDefinition): DbEntity | null => {
    if (ld.aggregate) {
      return hydrateAggregate(ld.aggregate);
    }
    if (!ld.entityId) {
      throw Error("__linkedData is missing field 'entityId'");
    }
    if (ld.entityVersionId) {
      return versionIdEntityMap.get(ld.entityVersionId)!;
    }
    // Find the non-fixed link in the graph corresponding to this __linkedData
    // @todo: could pre-compute a Map here to make this search faster
    const link = graph.links.find(
      ({ src, dst, fixed }) =>
        src.entityVersionId === entity.entityVersionId &&
        dst.entityId === ld.entityId &&
        !fixed
    )!;
    const linkedEntity = versionIdEntityMap.get(link.dst.entityVersionId)!;
    return linkedEntity;
  };

  const hydrateRecord = (record: Record<string, any>) => {
    for (const [key, value] of record.entries()) {
      if (Array.isArray(value)) {
        hydrateArray(value);
      } else if (key === "__linkedData") {
        const ld = value as LinkedDataDefinition;
        const linkedEntity = hydrateLinkedData(ld);
        // eslint-disable-next-line no-param-reassign
        record[key] = linkedEntity;
      } else if (isRecord(value)) {
        hydrateRecord(value);
      }
    }
  };

  while (stack.length > 0) {
    const item = stack.pop();
    if (Array.isArray(item)) {
      hydrateArray(item);
    } else if (isRecord(item)) {
      hydrateRecord(item);
    }
  }
};

/**
 * @todo: function assumes that the sub-graph rooted at `rootEntityVersionId` is acyclic.
 * What should we do for cyclic graphs?
 */
const hydrateRootSubgraph = (
  rootEntityVersionId: string,
  graph: Graph,
  entities: DbEntity[]
): DbEntity => {
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
    ])
  ).reverse();

  for (const entityVersionId of sortedEntityVersionIds) {
    const entity = entityVersionIdEntityMap.get(entityVersionId)!;
    hydrateEntity(entity, graph, entityVersionIdEntityMap);
  }

  return entityVersionIdEntityMap.get(rootEntityVersionId)!;
};

export const getImpliedEntityVersion: Resolver<
  Promise<EntityWithIncompleteEntityType>,
  {},
  GraphQLContext,
  QueryGetImpliedEntityVersionArgs
> = async (
  _,
  { accountId, entityId, impliedVersionCreatedAt },
  { dataSources }
) => {
  const { db, cache } = dataSources;

  // Get the implied version graph from the cache
  const graphStr = await cache.get(
    impliedVersionKey({
      accountId,
      entityId,
      createdAt: impliedVersionCreatedAt,
    })
  );
  if (!graphStr) {
    throw new ApolloError(
      `implied version for entity ${entityId} with createdAt time ${impliedVersionCreatedAt} does not exist`,
      "NOT_FOUND"
    );
  }
  const graph = JSON.parse(graphStr) as Graph;

  // Get all entities in the graph
  const entities = await db.getEntities(graph.entities);

  // Hydrate the root entity in the graph
  const root = entities.find(
    (entity) => entity.entityVersionId === graph.rootEntityVersionId
  )!;
  const hydratedRoot = hydrateRootSubgraph(
    root.entityVersionId,
    graph,
    entities
  );

  return new Entity(hydratedRoot).toGQLUnknownEntity();
};
