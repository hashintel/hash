import React from "react";

import { BlockComponent } from "@hashintel/block-protocol/react";

type AppProps = {
  name: string;
};

export const App: BlockComponent<AppProps> = ({ name }) => (
  <div>Hello {name}!</div>
);
