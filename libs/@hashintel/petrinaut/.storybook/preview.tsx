import "../src/index.css";

import type { Preview } from "@storybook/react-vite";
import { useRef } from "react";

import { PortalContainerContext } from "../src/state/portal-container-context";

const preview: Preview = {
  decorators: [
    (Story) => {
      const portalContainerRef = useRef<HTMLDivElement>(null);

      return (
        <div
          // Required (for now) given design tokens are scoped to .petrinaut-root
          className="petrinaut-root"
        >
          <div
            ref={portalContainerRef}
            style={{
              position: "absolute",
              top: "0",
              left: "0",
              width: "100%",
              height: "100%",
              zIndex: "99999",
              pointerEvents: "none",
            }}
          />

          <PortalContainerContext value={portalContainerRef}>
            <Story />
          </PortalContainerContext>
        </div>
      );
    },
  ],
};

export default preview;
