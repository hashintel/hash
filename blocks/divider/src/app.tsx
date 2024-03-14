import type { BlockComponent } from "@blockprotocol/graph/react";
import { useEntitySubgraph } from "@blockprotocol/graph/react";

import { propertyIds } from "./property-ids";
import type { BlockEntity } from "./types/generated/block-entity";

export const App: BlockComponent<BlockEntity> = ({
  graph: { blockEntitySubgraph },
}) => {
  const { rootEntity } = useEntitySubgraph(blockEntitySubgraph);
  const { [propertyIds.color]: color, [propertyIds.height]: height } =
    rootEntity.properties;

  return (
    <hr
      style={{
        width: "100%",
        border: "none",
        backgroundColor: color ?? "black",
        height: height ?? "1px",
      }}
    />
  );
};
