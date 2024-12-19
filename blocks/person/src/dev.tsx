/**
 * webpack-dev-server entry point for debugging.
 * This file is not bundled with the library during the build process.
 */
import { MockBlockDock } from "mock-block-dock";
import { createRoot } from "react-dom/client";

import Component from "./index";

const node = document.getElementById("app");

const personProperties = {
  avatar: "https://i.pravatar.cc/300",
  employer: {
    name: "Bain & Co.",
    position: "General Manager of Insurance Claims",
  },
  name: "Archibald Adams-Montgomery",
  email: "archie@example.com",
  link: "https://example.com/archie",
};

const App = () => (
  <div style={{ padding: "1em" }}>
    <div style={{ margin: "0 auto", width: "100%" }}>
      <MockBlockDock
        /* eslint-disable-next-line @typescript-eslint/no-unsafe-assignment */
        blockDefinition={{ ReactComponent: Component }}
        blockEntity={{
          entityId: "person1",
          properties: personProperties,
        }}
        debug
      />
    </div>
  </div>
);

createRoot(node!).render(<App />);
