/**
 * webpack-dev-server entry point for debugging.
 * This file is not bundled with the library during the build process.
 */
import { MockBlockDock } from "mock-block-dock";
import { render } from "react-dom";

import mockData from "../example-graph.json";
import Component from "./index";

const node = document.getElementById("app");

const App = () => {
  return (
    <MockBlockDock
      initialEntities={mockData.entities}
      initialEntityTypes={mockData.entityTypes}
      blockDefinition={{ ReactComponent: Component }}
      blockEntity={{
        entityId: "table-1",
        properties: {},
      }}
      debug
    />
  );
};

render(<App />, node);
