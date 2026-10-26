import { simplifyProperties } from "./simplify-properties.js";

import type {
  HasSpatiallyPositionedContent,
  HasSpatiallyPositionedContentProperties,
} from "./system-types/canvas.js";
import type {
  HasIndexedContent,
  HasIndexedContentProperties,
} from "./system-types/shared.js";
import type { HashLinkEntity } from "@local/hash-graph-sdk/entity";
import type { EntityTraversalPath } from "@local/hash-graph-store/types";

/**
 * Get the `hasLeftEntity` and `hasRightEntity` resolve depths for a block
 * collection entity.
 *
 * @param blockDataDepth - the depth at which to resolve linked block data entities (1 by default)
 */
export const getBlockCollectionTraversalPath = ({
  blockDataDepth = 1,
}: {
  blockDataDepth?: number;
}): EntityTraversalPath => ({
  edges: Array.from({ length: blockDataDepth + 1 }, () => [
    { kind: "has-left-entity", direction: "incoming" } as const,
    { kind: "has-right-entity", direction: "outgoing" } as const,
  ]).flat(),
});

const isSpatiallyPositionedProperties = (
  properties:
    | HasSpatiallyPositionedContentProperties
    | HasIndexedContentProperties,
): properties is HasSpatiallyPositionedContentProperties => {
  const testProperty: keyof HasSpatiallyPositionedContentProperties =
    "https://hash.ai/@h/types/property-type/rotation-in-rads/";

  return testProperty in properties;
};

type BlockCollectionLink = HashLinkEntity<
  HasSpatiallyPositionedContent | HasIndexedContent
>;

export const sortBlockCollectionLinks = (
  left: BlockCollectionLink,
  right: BlockCollectionLink,
): number => {
  if (
    isSpatiallyPositionedProperties(left.properties) ||
    isSpatiallyPositionedProperties(right.properties)
  ) {
    return 0;
  }
  const { fractionalIndex: leftFractionalIndex } = simplifyProperties(
    left.properties,
  );
  const { fractionalIndex: rightFractionalIndex } = simplifyProperties(
    right.properties,
  );

  if (leftFractionalIndex < rightFractionalIndex) {
    return -1;
  }
  return 1;
};
