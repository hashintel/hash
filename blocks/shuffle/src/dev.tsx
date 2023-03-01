/**
 * This is the entry point for developing and debugging.
 * This file is not bundled with the block during the build process.
 */
import { Entity } from "@blockprotocol/graph";
import { MockBlockDock } from "mock-block-dock";
import { render } from "react-dom";

import packageJSON from "../package.json";
import Component from "./index";
import { propertyIds } from "./property-ids";
import { ItemContent2, RootEntity } from "./types";

const node = document.getElementById("app");

const personEntity: Entity = {
  metadata: {
    entityTypeId:
      "https://blockprotocol-gqpc30oin.stage.hash.ai/@nate/types/entity-type/person/v/2",
    recordId: {
      entityId: "person-entity",
      editionId: "1",
    },
  },
  properties: {
    [propertyIds.name]: "John Doe",
  },
};

const blockEntity: RootEntity = {
  metadata: {
    entityTypeId:
      "https://blockprotocol-gqpc30oin.stage.hash.ai/@nate/types/entity-type/ordered-list-2/v/2",
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

const link1: ItemContent2 = {
  properties: {},
  metadata: {
    entityTypeId: propertyIds.itemContent,
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
      debug
    />
  );
};

render(<App />, node);
