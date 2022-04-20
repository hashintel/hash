/**
 * webpack-dev-server entry point for debugging.
 * This file is not bundled with the library during the build process.
 */
import React from "react";
import ReactDOM from "react-dom";
import { MockBlockDock } from "mock-block-dock";

import Component from "./index";

const node = document.getElementById("app");

const props = {
  avatar: "https://i.pravatar.cc/300",
  employer: {
    name: "Bain & Co.",
    position: "General Manager of Insurance Claims",
  },
  name: "Archibald Adams-Montgomery",
  email: "archie@example.com",
  link: "https://example.com/archie",
};

const App = () => (
  <div style={{ padding: "1em" }}>
    <div style={{ margin: "0 auto", width: "100%" }}>
      <MockBlockDock>
        <Component entityId="person1" {...props} />
      </MockBlockDock>
    </div>
  </div>
);

ReactDOM.render(<App />, node);
