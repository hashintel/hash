import "@local/brand-fonts/hash-sans.css";
import "../src/ui/index.css";
import { useRef } from "react";

import { PortalContainerContext } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

import type { Preview } from "@storybook/react-vite";

// The layer covers the whole story, so it must let presses through to the
// story beneath it — but its children are the portalled surfaces themselves
// (menus, selects, the ad-hoc value editor), and those have to be clickable.
// Without the child rule every portalled surface in Storybook is inert, which
// the app never is: there the portal container is `.petrinaut-root` itself.
const portalLayerStyle = css({
  position: "absolute",
  inset: "[0]",
  zIndex: "[99999]",
  pointerEvents: "none",
  "& > *": {
    pointerEvents: "auto",
  },
});

/** A story laid out `fullscreen` fills the viewport, as the editor fills its host. */
const fullscreenStyle = css({ height: "[100vh]" });

const preview: Preview = {
  parameters: {
    options: {
      storySort: {
        order: [
          "Editor",
          ["Example nets", "Composed nets", "Plugins"],
          "Components",
          "States",
        ],
      },
    },
  },
  decorators: [
    (Story, { parameters }) => {
      const portalContainerRef = useRef<HTMLDivElement>(null);

      return (
        <div
          // Required (for now) given design tokens are scoped to .petrinaut-root
          className={cx(
            "petrinaut-root",
            parameters.layout === "fullscreen" && fullscreenStyle,
          )}
        >
          <div ref={portalContainerRef} className={portalLayerStyle} />

          <PortalContainerContext value={portalContainerRef}>
            <Story />
          </PortalContainerContext>
        </div>
      );
    },
  ],
};

export default preview;
