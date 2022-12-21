/**
 * webpack-dev-server entry point for debugging.
 * This file is not bundled with the library during the build process.
 */

import { MockBlockDock } from "mock-block-dock";
import { render } from "react-dom";

import Component from "./index";

const node = document.getElementById("app");

const App = () => {
  return (
    <MockBlockDock
      blockDefinition={{ ReactComponent: Component }}
      blockEntity={{
        entityId: "entity-video",
        properties: {
          initialCaption: "A blooming flower",
          url: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.webm",
        },
      }}
      debug
    />
  );
};

render(<App />, node);
