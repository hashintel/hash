/**
 * webpack-dev-server entry point for debugging.
 * This file is not bundled with the library during the build process.
 */
import React from "react";
import ReactDOM from "react-dom";
import { MockBlockDock } from "mock-block-dock";

import Component from "./index";

const node = document.getElementById("app");

const calloutProperties = {
  text: "Hello World",
};

const App = () => (
  <MockBlockDock
    blockDefinition={{ ReactComponent: Component }}
    blockEntity={{
      entityId: "test-block-1",
      properties: calloutProperties,
    }}
  />
);

ReactDOM.render(<App />, node);
