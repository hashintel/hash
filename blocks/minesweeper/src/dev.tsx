import type { VersionedUrl } from "@blockprotocol/graph";
import { MockBlockDock } from "mock-block-dock";
import { createRoot } from "react-dom/client";

import packageJson from "../package.json";
import ElementClass from "./index";
import type { BlockEntity } from "./types/generated/block-entity";

const node = document.getElementById("app");

const testEntity: BlockEntity = {
  metadata: {
    recordId: {
      entityId: "minesweeper-block-1",
      editionId: new Date().toISOString(),
    },
    entityTypeId: packageJson.blockprotocol.blockEntityType as VersionedUrl,
  },
  properties: {
    "https://blockprotocol.org/@hash/types/property-type/number-of-columns/": 12,
    "https://blockprotocol.org/@hash/types/property-type/number-of-mines/": 30,
  },
} as const;

/**
 * This is an embedding application for local development and debugging.
 * It is the application loaded into the browser when you run 'yarn dev' (or 'npm run dev')
 * No data from it will be published with your block or included as part of a production build.
 *
 * The component used here, 'MockBlockDock', does the following:
 * 1. It renders your block on the page and provides the initial properties specified below
 * 2. It holds an in-memory datastore of entities and links
 * 3. It listens for messages from your blocks and updates its datastore appropriately (e.g. to create a new entity)
 * 4. It displays a debug UI allowing you to see the contents of its datastore, and messages sent back and forth
 */
const DevApp = () => {
  const tagName = packageJson.blockprotocol.blockType.tagName;
  if (!tagName) {
    throw new Error(
      "Please set a name for your custom element in package.json, under blockprotocol.blockType.tagName",
    );
  }

  return (
    <MockBlockDock
      blockDefinition={{
        customElement: {
          elementClass: ElementClass,
          tagName,
        },
      }}
      blockEntityRecordId={testEntity.metadata.recordId}
      blockInfo={packageJson.blockprotocol}
      debug // remove this to start with the debug UI minimised. You can also toggle it in the UI
      initialData={{
        initialEntities: [testEntity],
      }}
      simulateDatastoreLatency={{
        // configure this to adjust the range of artificial latency in responses to datastore-related requests (in ms)
        min: 50,
        max: 200,
      }}
    />
  );
};

if (node) {
  createRoot(node).render(<DevApp />);
} else {
  throw new Error("Unable to find DOM element with id 'app'");
}
