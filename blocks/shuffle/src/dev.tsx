/**
 * This is the entry point for developing and debugging.
 * This file is not bundled with the block during the build process.
 */
import { MockBlockDock } from "mock-block-dock";
import { render } from "react-dom";

import packageJSON from "../package.json";
import Component from "./index";
import { ItemContent2, ListItem2, RootEntity } from "./types";

const node = document.getElementById("app");

const blockEntity: RootEntity = {
  metadata: {
    entityTypeId:
      "https://blockprotocol-gqpc30oin.stage.hash.ai/@nate/types/entity-type/ordered-list-2/v/2",
    recordId: {
      entityId: "entity-ordered-list",
      editionId: "1",
    },
  },
  properties: {},
};

const listItem1: ListItem2 = {
  properties: {
    "https://blockprotocol-pktjfgq1m.stage.hash.ai/@blockprotocol/types/property-type/content/":
      "1",
  },
  metadata: {
    entityTypeId:
      "https://blockprotocol-gqpc30oin.stage.hash.ai/@nate/types/entity-type/list-item-2/v/2",
    recordId: {
      entityId: "entity-list-item-1",
      editionId: "1",
    },
  },
};

const listItem2: ListItem2 = {
  properties: {
    "https://blockprotocol-pktjfgq1m.stage.hash.ai/@blockprotocol/types/property-type/content/":
      "2",
  },
  metadata: {
    entityTypeId:
      "https://blockprotocol-gqpc30oin.stage.hash.ai/@nate/types/entity-type/list-item-2/v/2",
    recordId: {
      entityId: "entity-list-item-2",
      editionId: "1",
    },
  },
};

const link1: ItemContent2 = {
  properties: {},
  metadata: {
    entityTypeId:
      "https://blockprotocol-gqpc30oin.stage.hash.ai/@nate/types/entity-type/item-content-2/v/1",
    recordId: {
      entityId: "item-content-1",
      editionId: "1",
    },
  },
  linkData: {
    leftEntityId: blockEntity.metadata.recordId.entityId,
    rightEntityId: listItem1.metadata.recordId.entityId,
  },
};

const link2: ItemContent2 = {
  properties: {},
  metadata: {
    entityTypeId:
      "https://blockprotocol-gqpc30oin.stage.hash.ai/@nate/types/entity-type/item-content-2/v/1",
    recordId: {
      entityId: "item-content-2",
      editionId: "1",
    },
  },
  linkData: {
    leftEntityId: blockEntity.metadata.recordId.entityId,
    rightEntityId: listItem2.metadata.recordId.entityId,
  },
};

const initialEntities = [blockEntity, listItem1, listItem2, link1, link2];

const App = () => {
  return (
    <MockBlockDock
      blockDefinition={{ ReactComponent: Component }}
      blockEntityRecordId={blockEntity.metadata.recordId}
      initialData={{ initialEntities }}
      blockInfo={packageJSON.blockprotocol}
      debug
    />
  );
};

render(<App />, node);
