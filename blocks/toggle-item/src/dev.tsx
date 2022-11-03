/**
 * This is the entry point for developing and debugging.
 * This file is not bundled with the block during the build process.
 */
import { render } from "react-dom";

import { MockBlockDock } from "mock-block-dock";

import Component from "./index";

const node = document.getElementById("app");

const App = () => (
  <MockBlockDock>
    <Component
      entityId="test-block-1"
      title="Test title"
      content="Test content"
      open="true"
    />
  </MockBlockDock>
);

render(<App />, node);
