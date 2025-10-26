import type { HashLinkEntity } from "@local/hash-graph-sdk/entity";
import type { EntityTraversalPath } from "@rust/hash-graph-store/types";

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
export const getBlockCollectionTraversalPath = ({
  blockDataDepth = 1,
}: {
  blockDataDepth?: number;
}): EntityTraversalPath => ({
  edges: Array(blockDataDepth + 1)
    .fill([
      { kind: "has-left-entity", direction: "incoming" },
      { kind: "has-right-entity", direction: "outgoing" },
    ])
    .flat(),
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

export const sortBlockCollectionLinks = <
  Left extends HashLinkEntity<
    HasSpatiallyPositionedContent | HasIndexedContent
  >,
  Right extends HashLinkEntity<
    HasSpatiallyPositionedContent | HasIndexedContent
  >,
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
