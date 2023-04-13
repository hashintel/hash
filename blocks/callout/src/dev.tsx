/**
 * This is the entry point for developing and debugging.
 * This file is not bundled with the block during the build process.
 */
import { VersionedUrl } from "@blockprotocol/graph";
import { MockBlockDock } from "mock-block-dock";
import { render } from "react-dom";

import packageJSON from "../package.json";
import Component from "./index";
import { propertyIds } from "./property-ids";
import { RootEntity } from "./types";

const node = document.getElementById("app");

const initialData: RootEntity = {
  metadata: {
    entityTypeId: packageJSON.blockprotocol.schema as VersionedUrl,
    recordId: {
      entityId: "entity-callout",
      editionId: "1",
    },
  },
  properties: {
    [propertyIds.text]: "Hello World",
  },
};

const App = () => (
  <MockBlockDock
    blockDefinition={{ ReactComponent: Component }}
    blockEntityRecordId={initialData.metadata.recordId}
    initialData={{ initialEntities: [initialData] }}
    blockInfo={packageJSON.blockprotocol}
    simulateDatastoreLatency={{
      // configure this to adjust the range of artificial latency in responses to datastore-related requests (in ms)
      min: 50,
      max: 200,
    }}
    debug
  />
);

render(<App />, node);
