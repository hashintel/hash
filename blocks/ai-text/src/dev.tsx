import type { VersionedUrl } from "@blockprotocol/type-system";
import { MockBlockDock } from "mock-block-dock";
import { createRoot } from "react-dom/client";

import packageJSON from "../package.json";
import Component from "./index";
import type { BlockEntity } from "./types/generated/block-entity";

const node = document.getElementById("app");

const blockEntity: BlockEntity = {
  metadata: {
    recordId: {
      entityId: "block-entity",
      editionId: new Date().toISOString(),
    },
    entityTypeId: packageJSON.blockprotocol.blockEntityType as VersionedUrl,
  },
  properties: {},
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
  return (
    <MockBlockDock
      blockDefinition={{ ReactComponent: Component }}
      blockInfo={packageJSON.blockprotocol}
      debug
      initialData={{
        initialEntities: [blockEntity],
      }}
      simulateDatastoreLatency={{
        // configure this to adjust the range of artificial latency in responses to datastore-related requests (in ms)
        min: 50,
        max: 200,
      }}
      blockProtocolApiKey={process.env.BLOCK_PROTOCOL_API_KEY} // add this to an .env file in the block folder
      blockProtocolSiteHost={
        process.env.BLOCK_PROTOCOL_SITE_HOST ?? "https://blockprotocol.org"
      } // update this to a recent staging deployment when testing
    />
  );
};

if (node) {
  createRoot(node).render(<DevApp />);
} else {
  throw new Error("Unable to find DOM element with id 'app'");
}
