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
    <MockBlockDock>
      <Component entityId="table-1" />
    </MockBlockDock>
  );
};

ReactDOM.render(<App />, node);
