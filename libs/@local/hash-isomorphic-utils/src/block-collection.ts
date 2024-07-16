import type { Entity } from "@local/hash-graph-sdk/entity";
import type { GraphResolveDepths } from "@local/hash-subgraph";

import { simplifyProperties } from "./simplify-properties.js";
import type {
  HasSpatiallyPositionedContent,
  HasSpatiallyPositionedContentProperties,
} from "./system-types/canvas.js";
import type {
  HasIndexedContent,
  HasIndexedContentProperties,
} from "./system-types/shared.js";

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

const isSpatiallyPositionedProperties = (
  properties:
    | HasSpatiallyPositionedContentProperties
    | HasIndexedContentProperties,
): properties is HasSpatiallyPositionedContentProperties => {
  const testProperty: keyof HasSpatiallyPositionedContentProperties =
    "https://hash.ai/@hash/types/property-type/rotation-in-rads/";

  return testProperty in properties;
};

export const sortBlockCollectionLinks = <
  Left extends Entity<HasSpatiallyPositionedContent | HasIndexedContent>,
  Right extends Entity<HasSpatiallyPositionedContent | HasIndexedContent>,
>(
  a: Left,
  b: Right,
) => {
  if (
    isSpatiallyPositionedProperties(a.properties) ||
    isSpatiallyPositionedProperties(b.properties)
  ) {
    return 0;
  }
  const { fractionalIndex: aFractionalIndex } = simplifyProperties(
    a.properties,
  );
  const { fractionalIndex: bFractionalIndex } = simplifyProperties(
    b.properties,
  );

  return aFractionalIndex < bFractionalIndex ? -1 : 1;
};
