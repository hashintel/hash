/**
 * webpack-dev-server entry point for debugging.
 * This file is not bundled with the library during the build process.
 */

import React from "react";
import ReactDOM from "react-dom";
import { tw } from "twind";
import { MockBlockDock } from "mock-block-dock";

import Component from "./index";

const node = document.getElementById("app");

const App = () => {
  return (
    <div className={tw`mt-5`}>
      <MockBlockDock>
        <Component
          accountId="account-asdasd"
          entityId="entity-asdasd"
          initialCaption="Image of a Dog"
          url="https://placedog.net/450/300"
        />
      </MockBlockDock>
    </div>
  );
};

ReactDOM.render(<App />, node);
