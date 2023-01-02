/**
 * This is the entry point for developing and debugging.
 * This file is not bundled with the block during the build process.
 */
import { MockBlockDock } from "mock-block-dock";
import { render } from "react-dom";

import exampleGraph from "../example-graph.json";
import Component from "./index";

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

render(<App />, node);
