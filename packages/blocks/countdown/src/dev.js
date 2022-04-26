/**
 * This is the entry point for developing and debugging.
 * This file is not bundled with the block during the build process.
 */
import React from "react";
import ReactDOM from "react-dom";

import { MockBlockDock } from "mock-block-dock";

import Component from "./index";

const node = document.getElementById("app");

const App = () => (
  <MockBlockDock>
    <Component
      entityId="countdown"
      updateInterval={1 / 60}
      selectsRange={false}
      showWeekNumbers={true}
      strict={false}
      relative={true}
    />
  </MockBlockDock>
);

ReactDOM.render(<App />, node);
