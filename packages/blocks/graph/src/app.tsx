import * as React from "react";

import { BlockComponent } from "blockprotocol/react";
import { Graph } from "./Graph";

type AppProps = {
  name: string;
};

export const App: BlockComponent<AppProps> = ({ entityId, name }) => (
  <>
    <h1>Hello, {name}!</h1>
    <h2>I am a graph block :)</h2>
    <Graph />
  </>
);
