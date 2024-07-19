/**
 * Webpack-dev-server entry point for debugging.
 * This file is not bundled with the library during the build process.
 */

import { MockBlockDock } from "mock-block-dock";
import { createRoot } from "react-dom/client";
import type {
  Entity,
  RemoteFileEntityProperties,
  VersionedUrl,
} from "@blockprotocol/graph";

import packageJSON from "../package.json";

import { linkIds, propertyIds } from "./property-ids";
import type {
  BlockEntity,
  DisplaysMediaFile,
} from "./types/generated/block-entity";
import Component from "./index";

const node = document.querySelector("#app");

const initialData: BlockEntity = {
  properties: {
    [propertyIds.caption]: "A blooming flower",
  },
  metadata: {
    recordId: {
      entityId: "entity-video",
      editionId: "1",
    },
    entityTypeId: packageJSON.blockprotocol.blockEntityType as VersionedUrl,
  },
};

const fileEntity: Entity<RemoteFileEntityProperties> = {
  properties: {
    [propertyIds.bpUrl]:
      "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.webm",
    [propertyIds.filename]: "flower.webm",
    [propertyIds.mimeType]: "video/webm",
  },
  metadata: {
    recordId: {
      entityId: "entity-file",
      editionId: "1",
    },
    entityTypeId: linkIds.file,
  },
};

const fileEntityLink: DisplaysMediaFile = {
  linkData: {
    leftEntityId: initialData.metadata.recordId.entityId,
    rightEntityId: fileEntity.metadata.recordId.entityId,
  },
  metadata: {
    recordId: {
      entityId: "entity-link",
      editionId: "1",
    },
    entityTypeId: linkIds.file,
  },
  properties: {},
};

const App = () => {
  return (
    <MockBlockDock
      debug
      blockDefinition={{ ReactComponent: Component }}
      blockEntityRecordId={initialData.metadata.recordId}
      blockInfo={packageJSON.blockprotocol}
      initialData={{
        initialEntities: [initialData, fileEntity, fileEntityLink],
      }}
      simulateDatastoreLatency={{
        // configure this to adjust the range of artificial latency in responses to datastore-related requests (in ms)
        min: 50,
        max: 200,
      }}
    />
  );
};

createRoot(node!).render(<App />);
