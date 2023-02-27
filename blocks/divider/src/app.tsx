import { BlockComponent, useEntitySubgraph } from "@blockprotocol/graph/react";
import { propertyIds } from "./property-ids";
import { RootEntity } from "./types";

export const App: BlockComponent<RootEntity> = ({
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
