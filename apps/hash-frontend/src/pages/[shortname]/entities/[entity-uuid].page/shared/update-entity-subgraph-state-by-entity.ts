import {
  Entity,
  Subgraph,
  SubgraphRootTypes,
  Timestamp,
} from "@local/hash-subgraph/main";
import { Dispatch, SetStateAction } from "react";

export const updateEntitySubgraphStateByEntity = (
  entity: Entity,
  setStateAction: Dispatch<
    SetStateAction<Subgraph<SubgraphRootTypes["entity"]> | undefined>
  >,
) =>
  setStateAction((subgraph) => {
    /**
     * @todo - This is a problem, subgraphs should probably be immutable, there will be a new identifier
     *   for the updated entity. This version will not match the one returned by the data store.
     *   For places where we mutate elements, we should probably store them separately from the subgraph to
     *   allow for optimistic updates without being incorrect.
     */
    const newEntity = JSON.parse(JSON.stringify(entity)) as Entity;
    const newEntityVersion = new Date().toISOString() as Timestamp;
    newEntity.metadata.temporalVersioning.decisionTime.start.limit =
      newEntityVersion;
    newEntity.metadata.temporalVersioning.transactionTime.start.limit =
      newEntityVersion;

    return subgraph
      ? ({
          ...subgraph,
          roots: [
            {
              baseId: newEntity.metadata.recordId.entityId,
              version: newEntityVersion,
            },
          ],
          vertices: {
            ...subgraph.vertices,
            [newEntity.metadata.recordId.entityId]: {
              ...subgraph.vertices[newEntity.metadata.recordId.entityId],
              [newEntityVersion]: {
                kind: "entity",
                inner: newEntity,
              },
            },
          },
        } as Subgraph<SubgraphRootTypes["entity"]>)
      : undefined;
  });
