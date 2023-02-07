import { MockBlockDock } from "mock-block-dock";
import { createRoot } from "react-dom/client";

import packageJSON from "../package.json";
import Component from "./index";
import { RootEntity } from "./types.gen";

const node = document.getElementById("app");

const initialData: RootEntity = {
  metadata: {
    entityTypeId:
      "https://alpha.hash.ai/@luisbett/types/entity-type/address-block/v/1",
    editionId: {
      baseId: "entity-address",
      versionId: "1",
    },
  },
  properties: {},
};

const DevApp = () => {
  return (
    <MockBlockDock
      blockDefinition={{ ReactComponent: Component }}
      blockEntityEditionId={initialData.metadata.editionId}
      initialEntities={[initialData]}
      blockInfo={packageJSON.blockprotocol}
      debug
    />
  );
};

if (node) {
  createRoot(node).render(<DevApp />);
} else {
  throw new Error("Unable to find DOM element with id 'app'");
}
