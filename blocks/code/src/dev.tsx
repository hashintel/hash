/**
 * This is the entry point for developing and debugging.
 * This file is not bundled with the library during the build process.
 */
import { MockBlockDock } from "mock-block-dock";
import { createRoot } from "react-dom/client";

import packageJSON from "../package.json";
import Component from "./index";
import { RootEntity } from "./types.gen";

const node = document.getElementById("app");

/**
 * @type {{content: string; language: import("./utils").LanguageType;}}
 */
const initialData: RootEntity = {
  metadata: {
    entityTypeId: "https://alpha.hash.ai/@ciaran/types/entity-type/code/v/1",
    editionId: {
      baseId: "entity-code",
      versionId: "1",
    },
  },
  properties: {
    "https://alpha.hash.ai/@ciaran/types/property-type/content/":
      'var foo = "bar";',
    "https://alpha.hash.ai/@ciaran/types/property-type/language/": "javascript",
  },
};

const DevApp = () => {
  return (
    <MockBlockDock
      blockDefinition={{ ReactComponent: Component }}
      blockEntityEditionId={initialData.metadata.editionId}
      initialEntities={[initialData]}
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
