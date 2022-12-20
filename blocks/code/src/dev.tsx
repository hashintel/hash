/**
 * This is the entry point for developing and debugging.
 * This file is not bundled with the library during the build process.
 */
import { MockBlockDock } from "mock-block-dock";
import { createRoot } from "react-dom/client";

import packageJSON from "../package.json";
import Component from "./index";

const node = document.getElementById("app");

/**
 * @type {{content: string; language: import("./utils").LanguageType;}}
 */
const initialData = {
  content: 'var foo = "bar";',
  language: "javascript",
};

const DevApp = () => {
  return (
    <MockBlockDock
      blockDefinition={{ ReactComponent: Component }}
      blockEntity={{ entityId: "entity-code", properties: initialData }}
      blockInfo={packageJSON.blockprotocol}
      debug
    />
  );
};

if (node) {
  createRoot(node).render(<DevApp />);
} else {
  throw new Error("Unable to find DOM element with id 'app'");
}
