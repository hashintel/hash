/**
 * This is the entry point for developing and debugging.
 * This file is not bundled with the block during the build process.
 */
import React from "react";
import ReactDOM from "react-dom";

import { MockBlockDock } from "mock-block-dock";

import Component from "./index";
import exampleGraph from "../example-graph.json";

const node = document.getElementById("app");

const App = () => (
  <MockBlockDock
    initialEntities={exampleGraph.entities}
    initialEntityTypes={exampleGraph.entityTypes}
    initialLinks={exampleGraph.links}
    blockDefinition={{ ReactComponent: Component }}
    blockEntity={{
      entityId: "entity-github-pr-overview",
      properties: {},
    }}
    debug
  />
);

ReactDOM.render(<App />, node);
