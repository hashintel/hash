import {
  Resolver,
  ImpliedEntityHistory,
  ImpliedEntityVersion,
  QueryGetImpliedEntityHistoryArgs,
} from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";
import { genId } from "../../../util";

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
    impliedVersionId: genId(),
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
    impliedVersions.map(({ impliedVersionId }, i) =>
      cache.set(impliedVersionId, JSON.stringify(graphs[i]))
    )
  );

  // Cache the implied history timeline as a list.
  await cache.rpush(
    history.timelineId,
    ...history.timeline.map((ver) => JSON.stringify(ver))
  );

  return history;
};
