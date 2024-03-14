/**
 * This is the entry point for developing and debugging.
 * This file is not bundled with the block during the build process.
 */
import type { Entity, VersionedUrl } from "@blockprotocol/graph";
import { MockBlockDock } from "mock-block-dock";
import { createRoot } from "react-dom/client";

import packageJSON from "../package.json";
import Component from "./index";
import { entityTypeIds, propertyIds } from "./property-ids";
import type {
  BlockEntity,
  HasRepresentativeShuffleBlockItem,
} from "./types/generated/block-entity";

const node = document.getElementById("app");

const personEntity: Entity = {
  metadata: {
    entityTypeId: "https://mock-type/person/v/1",
    recordId: {
      entityId: "person-entity",
      editionId: "1",
    },
  },
  properties: {
    "https://blockprotocol-r2l2zq4gf.stage.hash.ai/@blockprotocol/types/property-type/name/":
      "John Doe",
  },
};

const blockEntity: BlockEntity = {
  metadata: {
    entityTypeId: packageJSON.blockprotocol.blockEntityType as VersionedUrl,
    recordId: {
      entityId: "entity-ordered-list",
      editionId: "1",
    },
  },
  properties: {
    [propertyIds.list]: [
      {
        [propertyIds.id]: "1",
        [propertyIds.value]: "Thing 1",
      },
      {
        [propertyIds.id]: "2",
        [propertyIds.linkEntityId]: "item-content-1",
        [propertyIds.value]: "",
      },
    ],
  },
};

const link1: HasRepresentativeShuffleBlockItem = {
  properties: {},
  metadata: {
    entityTypeId: entityTypeIds.hasRepresentativeShuffleBlockItem,
    recordId: {
      entityId: "item-content-1",
      editionId: "1",
    },
  },
  linkData: {
    leftEntityId: blockEntity.metadata.recordId.entityId,
    rightEntityId: personEntity.metadata.recordId.entityId,
  },
};

const initialEntities = [blockEntity, link1, personEntity];

const App = () => {
  return (
    <MockBlockDock
      blockDefinition={{ ReactComponent: Component }}
      blockEntityRecordId={blockEntity.metadata.recordId}
      initialData={{ initialEntities }}
      blockInfo={packageJSON.blockprotocol}
      simulateDatastoreLatency={{
        // configure this to adjust the range of artificial latency in responses to datastore-related requests (in ms)
        min: 50,
        max: 200,
      }}
      debug
    />
  );
};

createRoot(node!).render(<App />);
