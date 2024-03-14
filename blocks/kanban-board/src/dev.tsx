import type { VersionedUrl } from "@blockprotocol/graph";
import { MockBlockDock } from "mock-block-dock";
import { createRoot } from "react-dom/client";

import packageJson from "../package.json";
import {
  cardContentKey,
  cardIdKey,
  columnCardsKey,
  columnIdKey,
  columnsKey,
  columnTitleKey,
} from "./components/board/board";
import Component from "./index";
import type { BlockEntity } from "./types/generated/block-entity";

const node = document.getElementById("app");

const testEntity: BlockEntity = {
  metadata: {
    recordId: {
      entityId: "test-entity",
      editionId: new Date().toISOString(),
    },
    entityTypeId: packageJson.blockprotocol.blockEntityType as VersionedUrl,
  },
  properties: {
    [columnsKey]: [
      {
        [columnIdKey]: "col-todo",
        [columnTitleKey]: "Todo",
        [columnCardsKey]: [
          { [cardIdKey]: "task-1", [cardContentKey]: "First task" },
          {
            [cardIdKey]: "task-2",
            [cardContentKey]: "Second task with a very long description",
          },
          {
            [cardIdKey]: "task-3",
            [cardContentKey]: "Third task",
          },
        ],
      },
      {
        [columnIdKey]: "col-in-progress",
        [columnTitleKey]: "In Progress",
        [columnCardsKey]: [
          { [cardIdKey]: "task-4", [cardContentKey]: "Fourth task" },
          { [cardIdKey]: "task-5", [cardContentKey]: "Fifth task" },
        ],
      },
      {
        [columnIdKey]: "col-done",
        [columnTitleKey]: "Done",
        [columnCardsKey]: [],
      },
    ],
  },
};

const DevApp = () => {
  return (
    <MockBlockDock
      blockDefinition={{ ReactComponent: Component }}
      blockEntityRecordId={testEntity.metadata.recordId}
      blockInfo={packageJson.blockprotocol}
      debug
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
