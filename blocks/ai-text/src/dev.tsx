import { MockBlockDock } from "mock-block-dock";
import { createRoot } from "react-dom/client";

import packageJSON from "../package.json";
import Component from "./index";
import { RootEntity } from "./types";

const node = document.getElementById("app");

const testEntity: RootEntity = {
  metadata: {
    recordId: {
      entityId: "test-entity",
      editionId: new Date().toISOString(),
    },
    entityTypeId:
      "https://blockprotocol.org/@hash/types/entity-type/ai-text-block/v/2",
  },
  properties: {
    "https://blockprotocol.org/@blockprotocol/types/property-type/openai-text-model-prompt/":
      "Draft a press release for a new AI chat API",
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
  return (
    <MockBlockDock
      blockDefinition={{ ReactComponent: Component }}
      blockInfo={packageJSON.blockprotocol}
      initialData={{
        initialEntities: [
          testEntity,
          // ...imageEntities
        ],
      }}
      // @todo add dot-env support
      blockProtocolApiKey={undefined} // Set this to an API key when testing
      blockProtocolSiteHost="https://blockprotocol.org" // update this to a recent staging deployment when testing
      debug
    />
  );
};

if (node) {
  createRoot(node).render(<DevApp />);
} else {
  throw new Error("Unable to find DOM element with id 'app'");
}
