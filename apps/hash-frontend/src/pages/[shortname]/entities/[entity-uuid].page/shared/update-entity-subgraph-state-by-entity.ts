import type { Entity } from "@local/hash-graph-sdk/entity";
import type {
  EntityRevisionId,
  EntityRootType,
  Subgraph,
} from "@local/hash-subgraph";
import type { Dispatch, SetStateAction } from "react";

export const updateEntitySubgraphStateByEntity = (
  entity: Entity,
  setStateAction: Dispatch<
    SetStateAction<Subgraph<EntityRootType> | undefined>
  >,
) =>
  setStateAction((subgraph) => {
    /**
     * @todo - This is a problem, subgraphs should probably be immutable, there will be a new identifier
     *   for the updated entity. This version will not match the one returned by the data store.
     *   For places where we mutate elements, we should probably store them separately from the subgraph to
     *   allow for optimistic updates without being incorrect.
     */
    const newEntityRevisionId = new Date().toISOString() as EntityRevisionId;
    entity.metadata.temporalVersioning.decisionTime.start.limit =
      newEntityRevisionId;
    entity.metadata.temporalVersioning.transactionTime.start.limit =
      newEntityRevisionId;

    return subgraph
      ? {
          ...subgraph,
          roots: [
            {
              baseId: entity.metadata.recordId.entityId,
              revisionId: newEntityRevisionId,
            },
          ],
          vertices: {
            ...subgraph.vertices,
            [entity.metadata.recordId.entityId]: {
              ...subgraph.vertices[entity.metadata.recordId.entityId],
              [newEntityRevisionId]: {
                kind: "entity",
                inner: entity,
              },
            },
          },
        }
      : undefined;
  });
