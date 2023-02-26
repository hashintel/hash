/**
 * webpack-dev-server entry point for debugging.
 * This file is not bundled with the library during the build process.
 */

import { MockBlockDock } from "mock-block-dock";
import { render } from "react-dom";

import packageJSON from "../package.json";
import Component from "./index";
import { RootEntity } from "./types";

const node = document.getElementById("app");

const properties = {
  url: "https://blockprotocol.org/@nate/types/property-type/url/",
  caption: "https://blockprotocol.org/@nate/types/property-type/caption/",
  width: "https://blockprotocol.org/@nate/types/property-type/width/",
};

const initialData: RootEntity = {
  properties: {
    [properties.url]: "https://placedog.net/450/300",
    [properties.caption]: "Image of a Dog",
  },
  metadata: {
    recordId: {
      entityId: "entity-image",
      editionId: "1",
    },
    entityTypeId: "https://blockprotocol.org/@nate/types/entity-type/media/v/2",
  },
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
