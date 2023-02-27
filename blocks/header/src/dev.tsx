/**
 * This is the entry point for developing and debugging.
 * This file is not bundled with the block during the build process.
 */
import { MockBlockDock } from "mock-block-dock";
import { render } from "react-dom";

import packageJSON from "../package.json";
import Component from "./index";
import { propertyIds } from "./property-ids";
import { RootEntity } from "./types";

const node = document.getElementById("app");

const initialData: RootEntity = {
  metadata: {
    entityTypeId:
      "https://blockprotocol.org/@nate/types/entity-type/heading/v/2",
    recordId: {
      entityId: "entity-heading",
      editionId: "1",
    },
  },
  properties: {
    [propertyIds.text]: "Hello, World",
    [propertyIds.level]: 2,
    [propertyIds.color]: "red",
  },
};

const App = () => (
  <MockBlockDock
    blockDefinition={{ ReactComponent: Component }}
    blockEntityRecordId={initialData.metadata.recordId}
    initialData={{ initialEntities: [initialData] }}
    blockInfo={packageJSON.blockprotocol}
    debug
  />
);

render(<App />, node);
