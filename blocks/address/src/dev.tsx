import { MockBlockDock } from "mock-block-dock";
import { createRoot } from "react-dom/client";

import { VersionedUrl } from "@blockprotocol/type-system/slim";
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
    entityTypeId: packageJson.blockprotocol.schema as VersionedUrl,
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
        initialEntities: [testEntity],
      }}
      blockProtocolApiKey="b10ck5.0f301b4ca291f59bc829570dd2e210b9.a90d38b5-d44f-4959-a1c6-9be3119b50b3"
      blockProtocolSiteHost="http://localhost:3000"
      debug
    />
  );
};

if (node) {
  createRoot(node).render(<DevApp />);
} else {
  throw new Error("Unable to find DOM element with id 'app'");
}
