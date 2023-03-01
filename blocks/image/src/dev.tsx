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
    [propertyIds.caption]: "Placeholder image",
  },
  metadata: {
    recordId: {
      entityId: "entity-image",
      editionId: "1",
    },
    entityTypeId: packageJSON.blockprotocol.schema as VersionedUrl,
  },
};

const fileEntity: Entity<RemoteFileEntityProperties> = {
  properties: {
    [propertyIds.bpUrl]: "https://picsum.photos/450/300",
    [propertyIds.filename]: "300.jpg",
    [propertyIds.mimeType]: "image/jpg",
  },
  metadata: {
    recordId: {
      entityId: "entity-file",
      editionId: "1",
    },
    entityTypeId:
      "https://blockprotocol.org/@blockprotocol/types/entity-type/file/v/1",
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
      debug
    />
  );
};

render(<App />, node);
