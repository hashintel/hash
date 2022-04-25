import React from "react";

import { BlockComponent } from "blockprotocol/react";

type AppProps = { color?: string; height?: string | number };

export const App: BlockComponent<AppProps> = ({ color, height }) => (
  <hr
    style={{
      width: "100%",
      border: "none",
      backgroundColor: color ?? "black",
      height: height ?? "1px",
    }}
  />
);
