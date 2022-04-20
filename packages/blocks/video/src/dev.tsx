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
    <div style={{ marginTop: 20 }}>
      <MockBlockDock>
        <Component
          accountId="account-asdasd"
          initialCaption="A blooming flower"
          entityId="entity-asdasd"
          url="https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.webm"
        />
      </MockBlockDock>
    </div>
  );
};

ReactDOM.render(<App />, node);
