/**
 * This is the entry point for developing and debugging.
 * This file is not bundled with the block during the build process.
 */
import { MockBlockDock } from "mock-block-dock";
import { createRoot } from "react-dom/client";
import type { VersionedUrl } from "@blockprotocol/graph";

import packageJSON from "../package.json";

import type { BlockEntity } from "./types/generated/block-entity";
import Component from "./index";

const node = document.querySelector("#app");

const initialData: BlockEntity = {
  metadata: {
    recordId: {
      entityId: "entity-countdown",
      editionId: "1",
    },
    entityTypeId: packageJSON.blockprotocol.blockEntityType as VersionedUrl,
  },
  properties: {},
};

const App = () => {
  return (
    <MockBlockDock
      debug
      blockDefinition={{ ReactComponent: Component }}
      blockEntityRecordId={initialData.metadata.recordId}
      initialData={{ initialEntities: [initialData] }}
      blockInfo={packageJSON.blockprotocol}
      simulateDatastoreLatency={{
        // configure this to adjust the range of artificial latency in responses to datastore-related requests (in ms)
        min: 50,
        max: 200,
      }}
    />
  );
};

createRoot(node!).render(<App />);
