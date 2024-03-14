/**
 * This is the entry point for developing and debugging.
 * This file is not bundled with the block during the build process.
 */
import type { VersionedUrl } from "@blockprotocol/graph";
import { MockBlockDock } from "mock-block-dock";
import { createRoot } from "react-dom/client";

import packageJSON from "../package.json";
import Component from "./index";
import { propertyIds } from "./property-ids";
import type { BlockEntity } from "./types/generated/block-entity";

const node = document.getElementById("app");

const initialData: BlockEntity = {
  metadata: {
    entityTypeId: packageJSON.blockprotocol.blockEntityType as VersionedUrl,
    recordId: {
      entityId: "entity-divider",
      editionId: "1",
    },
  },
  properties: {
    [propertyIds.color]: "red",
    [propertyIds.height]: 2,
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

createRoot(node!).render(<App />);
