import { EntityId, Subgraph } from "@local/hash-subgraph";
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
