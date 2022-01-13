import React from "react";

import { BlockComponent } from "blockprotocol/react";

type AppProps = {
  name: string;
};

export const App: BlockComponent<AppProps> = ({ name }) => (
  <div>Hello {name}!</div>
);
