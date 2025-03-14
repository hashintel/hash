import type { VersionedUrl } from "@blockprotocol/type-system";
import { MockBlockDock } from "mock-block-dock";
import { createRoot } from "react-dom/client";

import packageJSON from "../package.json";
import Component from "./index";
import type { BlockEntity } from "./types/generated/block-entity";

const node = document.getElementById("app");

const testEntity: BlockEntity = {
  metadata: {
    recordId: {
      entityId: "test-entity",
      editionId: new Date().toISOString(),
    },
    entityTypeId: packageJSON.blockprotocol.blockEntityType as VersionedUrl,
  },
  properties: {},
} as const;

const DevApp = () => {
  return (
    <MockBlockDock
      blockDefinition={{ ReactComponent: Component }}
      blockEntityRecordId={testEntity.metadata.recordId}
      blockInfo={packageJSON.blockprotocol}
      initialData={{
        initialEntities: [testEntity],
      }}
      simulateDatastoreLatency={{
        // configure this to adjust the range of artificial latency in responses to datastore-related requests (in ms)
        min: 50,
        max: 200,
      }}
      debug
    />
  );
};

if (node) {
  createRoot(node).render(<DevApp />);
} else {
  throw new Error("Unable to find DOM element with id 'app'");
}
