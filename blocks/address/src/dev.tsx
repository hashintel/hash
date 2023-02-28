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
      blockProtocolApiKey="b10ck5.0ffce85f8aa69ae4171bb7cf31e21ffa.f05b31ae-2340-4dd6-8d49-aae04a45f6f7"
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
