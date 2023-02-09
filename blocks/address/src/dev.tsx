import {
  EntityTemporalVersioningMetadata,
  QueryTemporalAxes,
} from "@blockprotocol/graph/.";
import { MockBlockDock } from "mock-block-dock";
import { createRoot } from "react-dom/client";

import { VersionedUri } from "@blockprotocol/type-system/slim";
import {
  default as packageJSON,
  default as packageJson,
} from "../package.json";
import Component from "./index";
import { RootEntity } from "./types.gen";

const node = document.getElementById("app");

const intervalForAllTime =
  (): EntityTemporalVersioningMetadata[keyof EntityTemporalVersioningMetadata] => {
    return {
      start: {
        kind: "inclusive",
        limit: new Date(0).toISOString(),
      },
      end: {
        kind: "unbounded",
      },
    } as const;
  };

const entityTemporalMetadata = (): EntityTemporalVersioningMetadata => {
  return {
    transactionTime: intervalForAllTime(),
    decisionTime: intervalForAllTime(),
  };
};

const currentTime = new Date().toISOString();

const temporalAxes: QueryTemporalAxes = {
  pinned: {
    axis: "transactionTime",
    timestamp: currentTime,
  },
  variable: {
    axis: "decisionTime",
    interval: {
      start: { kind: "unbounded" },
      end: { kind: "inclusive", limit: currentTime },
    },
  },
};

const testEntity: RootEntity = {
  metadata: {
    recordId: {
      entityId: "test-entity",
      editionId: new Date().toISOString(),
    },
    entityTypeId: packageJson.blockprotocol.schema as VersionedUri,
  },
  properties: {},
} as const;

const DevApp = () => {
  return (
    <MockBlockDock
      blockDefinition={{ ReactComponent: Component }}
      blockEntityRecordId={testEntity.metadata.recordId}
      blockInfo={packageJson.blockprotocol}
      initialData={{
        initialEntities: [
          {
            ...testEntity,
            metadata: {
              ...testEntity.metadata,
              temporalVersioning: entityTemporalMetadata(),
            },
          },
        ],
        initialTemporalAxes: temporalAxes,
      }}
      debug
    />
  );
};

if (node) {
  createRoot(node).render(<DevApp />);
} else {
  throw new Error("Unable to find DOM element with id 'app'");
}
