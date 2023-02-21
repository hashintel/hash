/**
 * This is the entry point for developing and debugging.
 * This file is not bundled with the block during the build process.
 */
import { MockBlockDock } from "mock-block-dock";
import { render } from "react-dom";

import packageJSON from "../package.json";
import { initialDurationProperty } from "./app";
import Component from "./index";
import { RootEntity } from "./types";

const node = document.getElementById("app");

const initialData: RootEntity = {
  metadata: {
    entityTypeId:
      "https://blockprotocol-ae37rxcaw.stage.hash.ai/@nate/types/entity-type/timer/v/2",
    recordId: {
      entityId: "entity-timer",
      editionId: "1",
    },
  },
  properties: {
    [initialDurationProperty]: "PT5M",
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
