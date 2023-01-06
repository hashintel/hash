import { Entity, Subgraph, SubgraphRootTypes } from "@hashintel/hash-subgraph";
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
    const newEntityVersion = new Date().toISOString();
    newEntity.metadata.version.decisionTime.start = newEntityVersion;

    return subgraph
      ? ({
          ...subgraph,
          roots: [
            {
              baseId: newEntity.metadata.editionId.baseId,
              version: newEntityVersion,
            },
          ],
          vertices: {
            ...subgraph.vertices,
            [newEntity.metadata.editionId.baseId]: {
              ...subgraph.vertices[newEntity.metadata.editionId.baseId],
              [newEntityVersion]: {
                kind: "entity",
                inner: newEntity,
              },
            },
          },
        } as Subgraph<SubgraphRootTypes["entity"]>)
      : undefined;
  });
