/**
 * webpack-dev-server entry point for debugging.
 * This file is not bundled with the library during the build process.
 */
import { render } from "react-dom";
import { MockBlockDock } from "mock-block-dock";

import Component from "./index";

const node = document.getElementById("app");

const headerProperties = {
  level: 2,
  color: "red",
  text: "Hello, World",
};

const App = () => (
  <MockBlockDock
    blockDefinition={{ ReactComponent: Component }}
    blockEntity={{
      entityId: "test-header-1",
      properties: headerProperties,
    }}
  />
);

render(<App />, node);
