/**
 * This is the entry point for developing and debugging.
 * This file is not bundled with the block during the build process.
 */
import { MockBlockDock } from "mock-block-dock";
import React from "react";
import ReactDOM from "react-dom";

import Component from "./index";

const node = document.getElementById("app");

const DevApp = () => {
  return (
    <MockBlockDock
      blockDefinition={{ ReactComponent: Component }}
      blockEntity={{
        entityId: "test-block-1",
        properties: {
          items: [
            { id: "1", value: "test 1" },
            { id: "2", value: "test 2" },
          ],
        },
      }}
      debug
    />
  );
};

ReactDOM.render(<DevApp />, node);
