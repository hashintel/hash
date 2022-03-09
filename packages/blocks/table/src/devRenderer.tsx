/**
 * webpack-dev-server entry point for debugging.
 * This file is not bundled with the library during the build process.
 */
import React from "react";
import ReactDOM from "react-dom";
import { MockBlockDock } from "mock-block-dock";

import Component from "./index";

import { initialTableData } from "./mockData/mockData";

const node = document.getElementById("app");

const App = () => {
  return (
    // @todo wrap in MockBlockDock once https://github.com/blockprotocol/blockprotocol/pull/249 is merged
    <MockBlockDock>
      <Component
        initialState={initialTableData.initialState}
        entityId="table-1"
      />
    </MockBlockDock>
  );
};

ReactDOM.render(<App />, node);
