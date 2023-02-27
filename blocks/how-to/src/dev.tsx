import {
  EntityTemporalVersioningMetadata,
  QueryTemporalAxes,
} from "@blockprotocol/graph";
import { MockBlockDock } from "mock-block-dock";
import { createRoot } from "react-dom/client";

import { VersionedUri } from "@blockprotocol/type-system/slim";
import { default as packageJson } from "../package.json";
import Component from "./index";
import { RootEntity } from "./types";

const node = document.getElementById("app");

const testEntity: RootEntity = {
  metadata: {
    recordId: {
      entityId: "test-entity",
      editionId: new Date().toISOString(),
    },
    entityTypeId: packageJson.blockprotocol.schema as VersionedUri,
  },
  properties: {
    // "http://localhost:3000/@lbett/types/property-type/title/": "test title",
    // "http://localhost:3000/@lbett/types/property-type/description/":
    //   "test description",
  },
} as const;

const intro: RootEntity = {
  metadata: {
    recordId: {
      entityId: "intro",
      editionId: new Date().toISOString(),
    },
    entityTypeId:
      "http://localhost:3000/@lbett/types/entity-type/howto-step/v/3",
  },
  properties: {
    "http://localhost:3000/@lbett/types/property-type/title/": "intro",
    "http://localhost:3000/@lbett/types/property-type/description/":
      "intro description",
  },
} as const;

const introLink: RootEntity = {
  metadata: {
    recordId: {
      entityId: "intro-link",
      editionId: new Date().toISOString(),
    },
    entityTypeId:
      "http://localhost:3000/@lbett/types/entity-type/introduction-link/v/1",
  },
  properties: {},
  linkData: {
    leftEntityId: testEntity.metadata.recordId.entityId,
    rightEntityId: intro.metadata.recordId.entityId,
  },
} as const;

const step1: RootEntity = {
  metadata: {
    recordId: {
      entityId: "step-1",
      editionId: new Date().toISOString(),
    },
    entityTypeId:
      "http://localhost:3000/@lbett/types/entity-type/howto-step/v/3",
  },
  properties: {
    "http://localhost:3000/@lbett/types/property-type/title/": "1",
    "http://localhost:3000/@lbett/types/property-type/description/": "2",
  },
} as const;

const step1Link: RootEntity = {
  metadata: {
    recordId: {
      entityId: "step-1-link",
      editionId: new Date().toISOString(),
    },
    entityTypeId:
      "http://localhost:3000/@lbett/types/entity-type/step-link/v/1",
  },
  properties: {},
  linkData: {
    leftEntityId: testEntity.metadata.recordId.entityId,
    rightEntityId: step1.metadata.recordId.entityId,
  },
} as const;

const step2: RootEntity = {
  metadata: {
    recordId: {
      entityId: "step-2",
      editionId: new Date().toISOString(),
    },
    entityTypeId:
      "http://localhost:3000/@lbett/types/entity-type/howto-step/v/3",
  },
  properties: {
    "http://localhost:3000/@lbett/types/property-type/title/": "2",
    "http://localhost:3000/@lbett/types/property-type/description/": "3",
  },
} as const;

const step2Link: RootEntity = {
  metadata: {
    recordId: {
      entityId: "step-2-link",
      editionId: new Date().toISOString(),
    },
    entityTypeId:
      "http://localhost:3000/@lbett/types/entity-type/step-link/v/1",
  },
  properties: {},
  linkData: {
    leftEntityId: testEntity.metadata.recordId.entityId,
    rightEntityId: step2.metadata.recordId.entityId,
  },
} as const;

const DevApp = () => {
  return (
    <MockBlockDock
      blockDefinition={{ ReactComponent: Component }}
      blockEntityRecordId={testEntity.metadata.recordId}
      blockInfo={packageJson.blockprotocol}
      initialData={{
        initialEntities: [
          testEntity,
          intro,
          introLink,
          step1,
          step1Link,
          step2,
          step2Link,
        ],
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
