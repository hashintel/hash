import { Entity, EntityId, Subgraph } from "@local/hash-subgraph";
import { getEntityRevisionsByEntityId } from "@local/hash-subgraph/stdlib";

export const getFirstRevisionCreatedAt = (
  subgraph: Subgraph,
  entityId: EntityId,
) =>
  getEntityRevisionsByEntityId(subgraph, entityId).reduce<Date>(
    (earliestCreatedAt, current) => {
      const currentCreatedAt = new Date(
        current.metadata.temporalVersioning.decisionTime.start.limit,
      );

      return earliestCreatedAt < currentCreatedAt
        ? earliestCreatedAt
        : currentCreatedAt;
    },
    new Date(),
  );

export const getFirstRevision = (subgraph: Subgraph, entityId: EntityId) => {
  const revisions = getEntityRevisionsByEntityId(subgraph, entityId);

  return revisions.reduce<Entity>((previous, current) => {
    const currentCreatedAt = new Date(
      current.metadata.temporalVersioning.decisionTime.start.limit,
    );

    const previousCreatedAt = new Date(
      previous.metadata.temporalVersioning.decisionTime.start.limit,
    );

    return currentCreatedAt.getTime() < previousCreatedAt.getTime()
      ? current
      : previous;
  }, revisions[0]!);
};
