/**
 * webpack-dev-server entry point for debugging.
 * This file is not bundled with the library during the build process.
 */

import {
  Entity,
  RemoteFileEntityProperties,
  VersionedUrl,
} from "@blockprotocol/graph";
import { MockBlockDock } from "mock-block-dock";
import { render } from "react-dom";

import packageJSON from "../package.json";
import Component from "./index";
import { linkIds, propertyIds } from "./property-ids";
import { DisplaysMediaFile, RootEntity } from "./types";

const node = document.getElementById("app");

const initialData: RootEntity = {
  properties: {
    [propertyIds.caption]: "A blooming flower",
  },
  metadata: {
    recordId: {
      entityId: "entity-video",
      editionId: "1",
    },
    entityTypeId: packageJSON.blockprotocol.schema as VersionedUrl,
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
      blockDefinition={{ ReactComponent: Component }}
      blockEntityRecordId={initialData.metadata.recordId}
      initialData={{
        initialEntities: [initialData, fileEntity, fileEntityLink],
      }}
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

render(<App />, node);
