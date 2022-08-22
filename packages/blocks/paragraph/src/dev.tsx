/**
 * webpack-dev-server entry point for debugging.
 * This file is not bundled with the library during the build process.
 */
import { render } from "react-dom";
import { MockBlockDock } from "mock-block-dock";

import Component from "./index";

const node = document.getElementById("app");

const paragraphProperties = {
  text: "Hello World!",
};

const App = () => (
  <MockBlockDock
    blockDefinition={{ ReactComponent: Component }}
    blockEntity={{
      entityId: "test-para-1",
      properties: paragraphProperties,
    }}
  />
);

render(<App />, node);
