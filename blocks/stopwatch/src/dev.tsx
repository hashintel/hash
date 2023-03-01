/**
 * This is the entry point for developing and debugging.
 * This file is not bundled with the block during the build process.
 */
import { VersionedUrl } from "@blockprotocol/graph";
import { MockBlockDock } from "mock-block-dock";
import { render } from "react-dom";

import packageJSON from "../package.json";
import Component from "./index";
import { RootEntity } from "./types";

const node = document.getElementById("app");

const initialData: RootEntity = {
  metadata: {
    recordId: {
      entityId: "entity-stopwatch",
      editionId: "1",
    },
    entityTypeId: packageJSON.blockprotocol.schema as VersionedUrl,
  },
  properties: {},
};

const App = () => {
  return (
    <MockBlockDock
      blockDefinition={{ ReactComponent: Component }}
      blockEntityRecordId={initialData.metadata.recordId}
      initialData={{ initialEntities: [initialData] }}
      blockInfo={packageJSON.blockprotocol}
      debug
    />
  );
};

render(<App />, node);
