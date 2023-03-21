import { VersionedUrl } from "@blockprotocol/graph";
import { MockBlockDock } from "mock-block-dock";
import { createRoot } from "react-dom/client";

import packageJson from "../package.json";
import { ColumnsState } from "./components/board/types";
import Component from "./index";
import { RootEntity } from "./types";

const node = document.getElementById("app");

const testEntity: RootEntity = {
  metadata: {
    recordId: {
      entityId: "test-entity",
      editionId: new Date().toISOString(),
    },
    entityTypeId: packageJson.blockprotocol.schema as VersionedUrl,
  },
  properties: {
    "https://blockprotocol-hk4sbmd9k.stage.hash.ai/@yusuf123/types/property-type/kanban-column-order/":
      ["col-todo", "col-in-progress", "col-done"],
    "https://blockprotocol-hk4sbmd9k.stage.hash.ai/@yusuf123/types/property-type/kanban-columns/":
      {
        "col-todo": {
          id: "col-todo",
          title: "Todo",
          cards: [
            { id: "task-1", content: "First task" },
            {
              id: "task-2",
              content: "Second task with a very long description",
            },
            {
              id: "task-3",
              content: "Third task",
            },
          ],
        },
        "col-in-progress": {
          id: "col-in-progress",
          title: "In Progress",
          cards: [
            { id: "task-4", content: "Fourth task" },
            { id: "task-5", content: "Fifth task" },
          ],
        },
        "col-done": { id: "col-done", title: "Done", cards: [] },
      } as ColumnsState,
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
    />
  );
};

if (node) {
  createRoot(node).render(<DevApp />);
} else {
  throw new Error("Unable to find DOM element with id 'app'");
}
