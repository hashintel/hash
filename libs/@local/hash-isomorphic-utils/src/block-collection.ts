import { GraphResolveDepths } from "@local/hash-subgraph";

/**
 * Get the `hasLeftEntity` and `hasRightEntity` resolve depths for a block
 * collection entity.
 *
 * @param blockDataDepth - the depth at which to resolve linked block data entities (1 by default)
 */
export const getBlockCollectionResolveDepth = ({
  blockDataDepth = 1,
}: {
  blockDataDepth?: number;
}): Pick<GraphResolveDepths, "hasLeftEntity" | "hasRightEntity"> => ({
  hasLeftEntity: { incoming: blockDataDepth + 1, outgoing: 0 },
  hasRightEntity: { incoming: 0, outgoing: blockDataDepth + 1 },
});
