import React from "react";

import { BlockComponent } from "blockprotocol/react";

type BlockEntityProperties = { color?: string; height?: string | number };

export const App: BlockComponent<BlockEntityProperties> = ({
  color,
  height,
}) => (
  <hr
    style={{
      width: "100%",
      border: "none",
      backgroundColor: color ?? "black",
      height: height ?? "1px",
    }}
  />
);
