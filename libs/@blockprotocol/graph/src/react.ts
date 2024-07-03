import { useModuleConstructor } from "@blockprotocol/core/react";
import type { FunctionComponent, RefObject } from "react";
import { useMemo } from "react";

import type {
  BlockGraphProperties,
  Entity,
  EntityVertexId,
  LinkEntityAndRightEntity,
  Subgraph,
} from "./main.js";
import { GraphBlockHandler, GraphEmbedderHandler } from "./main.js";
import { getOutgoingLinkAndTargetEntities, getRoots } from "./stdlib.js";

export type BlockComponent<RootEntity extends Entity = Entity> =
  FunctionComponent<BlockGraphProperties<RootEntity>>;

/**
 * Create a GraphBlockHandler instance, using a reference to an element in the block.
 *
 * The graphModule will only be reconstructed if the element reference changes.
 * Updates to any callbacks after first constructing should be made by calling graphModule.on("messageName", callback);
 */
export const useGraphBlockModule = (
  ref: RefObject<HTMLElement>,
  constructorArgs?: Omit<
    ConstructorParameters<typeof GraphBlockHandler>[0],
    "element"
  >,
): { graphModule: GraphBlockHandler } => ({
  graphModule: useModuleConstructor({
    Handler: GraphBlockHandler,
    constructorArgs,
    ref,
  }),
});

/**
 * Create a GraphBlockHandler instance, using a reference to an element in the block.
 *
 * The graphModule will only be reconstructed if the element reference changes.
 * Updates to any callbacks after first constructing should be made by:
 * 1. to register one, call graphModule.on("messageName", callback);
 * 2. to register multiple, call graphModule.registerCallbacks({ [messageName]: callback });
 */
export const useGraphEmbedderModule = (
  ref: RefObject<HTMLElement>,
  constructorArgs: Omit<
    ConstructorParameters<typeof GraphEmbedderHandler>[0],
    "element"
  >,
): { graphModule: GraphEmbedderHandler } => ({
  graphModule: useModuleConstructor({
    Handler: GraphEmbedderHandler as { new (): GraphEmbedderHandler },
    ref,
    constructorArgs,
  }),
});

export const useEntitySubgraph = <
  RootEntity extends Entity,
  RootEntityLinkedEntities extends LinkEntityAndRightEntity[],
>(
  entitySubgraph: Subgraph<{
    vertexId: EntityVertexId;
    element: RootEntity;
  }>,
) => {
  return useMemo(() => {
    const rootEntity = getRoots(entitySubgraph)[0];
    if (!rootEntity) {
      throw new Error("Root entity not present in subgraph");
    }

    const linkedEntities =
      getOutgoingLinkAndTargetEntities<RootEntityLinkedEntities>(
        entitySubgraph,
        rootEntity.metadata.recordId.entityId,
      );

    return {
      rootEntity,
      linkedEntities,
    };
  }, [entitySubgraph]);
};
