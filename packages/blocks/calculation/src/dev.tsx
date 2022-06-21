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
          cells: [
            [["A", 1], "Employees"],
            [["B", 1], "Count"],
            [["C", 1], "Average"],
            [["A", 2], "=count()"],
            [["B", 2], "=sum(employees)"],
            [["C", 2], "=B2/A2"],
            [["A", 3], "=count()"],
          ],
          rows: [
            [1, null],
            [2, "Company"],
            [3, "Person"],
          ],
        },
      }}
      debug
    />
  );
};

ReactDOM.render(<DevApp />, node);
