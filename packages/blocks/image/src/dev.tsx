/**
 * webpack-dev-server entry point for debugging.
 * This file is not bundled with the library during the build process.
 */

import React from "react";
import ReactDOM from "react-dom";
import { MockBlockDock } from "mock-block-dock";

import Component from "./index";

const node = document.getElementById("app");

const App = () => {
  return (
    <MockBlockDock
      blockDefinition={{ ReactComponent: Component }}
      blockEntity={{
        entityId: "entity-image",
        properties: {
          initialCaption: "Image of a Dog",
          url: "https://placedog.net/450/300",
        },
      }}
      debug
    />
  );
};

ReactDOM.render(<App />, node);
