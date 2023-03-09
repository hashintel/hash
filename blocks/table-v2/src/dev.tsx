import { VersionedUrl } from "@blockprotocol/type-system";
import { MockBlockDock } from "mock-block-dock";
import { createRoot } from "react-dom/client";

import packageJson from "../package.json";
import Component from "./index";
import { RootEntity } from "./types";

const node = document.getElementById("app");

// @todo make type blockprotocol.org/[etc]/ExampleEntity when we can host new types there
const testEntity: RootEntity = {
  metadata: {
    recordId: { entityId: "test-entity", editionId: new Date().toISOString() },
    entityTypeId: packageJson.blockprotocol.schema as VersionedUrl,
  },
  properties: {
    "https://blockprotocol-gkgdavns7.stage.hash.ai/@luisbett/types/property-type/title/":
      "My Table",
    "https://blockprotocol-hk4sbmd9k.stage.hash.ai/@yusuf123/types/property-type/table-local-column/":
      [
        {
          "https://blockprotocol-gkgdavns7.stage.hash.ai/@luisbett/types/property-type/title/":
            "Full Name",
          "https://blockprotocol-gqpc30oin.stage.hash.ai/@nate/types/property-type/id/":
            "fullName",
        },
        {
          "https://blockprotocol-gkgdavns7.stage.hash.ai/@luisbett/types/property-type/title/":
            "Role",
          "https://blockprotocol-gqpc30oin.stage.hash.ai/@nate/types/property-type/id/":
            "role",
        },
      ],
    "https://blockprotocol-hk4sbmd9k.stage.hash.ai/@yusuf123/types/property-type/table-local-row/":
      [
        {
          fullName: "David Davidson",
          role: "CEO",
        },
        {
          fullName: "John Johnson",
          role: "Head of Engineering",
        },
        {
          fullName: "React Reactson",
          role: "Frontend Developer",
        },
        {
          fullName: "Node Nodeson",
          role: "Backend Developer",
        },
      ],
  },
};

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
      blockEntityRecordId={testEntity.metadata.recordId}
      blockInfo={packageJson.blockprotocol}
      debug // remove this to start with the debug UI minimised. You can also toggle it in the UI
      initialData={{ initialEntities: [testEntity] }}

      // hideDebugToggle <- uncomment this to disable the debug UI entirely
      // initialEntities={[]} <- customise the entities in the datastore (blockEntity is always added, if you provide it)
      // initialEntityTypes={[]} <- customise the entity types in the datastore
      // initialLinks={[]} <- customise the links in the datastore
      // initialLinkedAggregations={[]} <- customise the linkedAggregations in the datastore
      // readonly <- uncomment this to start your block in readonly mode. You can also toggle it in the UI
    />
  );
};

if (node) {
  createRoot(node).render(<DevApp />);
} else {
  throw new Error("Unable to find DOM element with id 'app'");
}
