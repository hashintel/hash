/**
 * This is the entry point for developing and debugging.
 * This file is not bundled with the library during the build process.
 */
import { VersionedUrl } from "@blockprotocol/graph";
import { MockBlockDock } from "mock-block-dock";
import { createRoot } from "react-dom/client";

import packageJSON from "../package.json";
import Component from "./index";
import { propertyIds } from "./property-ids";
import { RootEntity } from "./types";

const node = document.getElementById("app");

/**
 * @type {{content: string; language: import("./utils").LanguageType;}}
 */
const initialEntity: RootEntity = {
  metadata: {
    entityTypeId: packageJSON.blockprotocol.schema as VersionedUrl,
    recordId: {
      entityId: "entity-code",
      editionId: new Date().toISOString(),
    },
  },
  properties: {
    [propertyIds.content]:
      "function debounce(func, timeout = 300){\n  let timer;\n  return (...args) => {\n    clearTimeout(timer);\n    timer = setTimeout(() => { func.apply(this, args); }, timeout);\n  };\n}",
    [propertyIds.language]: "javascript",
  },
};

const DevApp = () => {
  return (
    <MockBlockDock
      blockDefinition={{ ReactComponent: Component }}
      blockEntityRecordId={initialEntity.metadata.recordId}
      initialData={{ initialEntities: [initialEntity] }}
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
