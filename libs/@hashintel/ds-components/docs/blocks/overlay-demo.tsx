import { useRef, useState } from "react";

import { Button } from "../../src/components/Button/button";
import { PortalContainerContext } from "../../src/util/portal-container-context";
import { overlayDemoRecipe } from "./overlay-demo.recipe";

/**
 * Live harness for overlay examples (Dialog, Drawer, Popover) in docs Stages.
 * The library's overlays open by mounting — there is no `open` prop — so the
 * harness owns that state behind one trigger Button (`triggerLabel`), or a
 * row of them sharing the frame (`triggers`, with the active label handed to
 * the render prop). Its frame's `transform` makes it the containing block for
 * the overlays' `position: fixed`, and providing the portal container keeps
 * Ark's portals inside it, so backdrops and panels stay confined to the demo
 * box. Pair with Stage's `code` override so readers copy the controlled
 * pattern, not the harness.
 */

const classes = overlayDemoRecipe();

export const OverlayDemo = ({
  triggerLabel,
  triggers,
  children,
}: {
  /** Label of the Button that toggles the overlay. */
  triggerLabel?: string;
  /** Several variant triggers sharing this frame; each label names its variant. */
  triggers?: readonly string[];
  /**
   * Renders the mounted overlay: `close` unmounts it, `trigger` is the active
   * trigger's label, and `triggerRef` is set on the active trigger Button for
   * anchored overlays such as Popover.
   */
  children: (controls: {
    close: () => void;
    trigger: string;
    triggerRef: React.RefObject<HTMLButtonElement | null>;
  }) => React.ReactNode;
}) => {
  // The render prop receives `triggerRef` to hand to anchored overlays, which
  // the React Compiler's ref rule can't see is render-safe.

  "use no memo";

  const labels = triggers ?? (triggerLabel === undefined ? [] : [triggerLabel]);
  const [active, setActive] = useState<string | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  return (
    <div ref={frameRef} className={classes.frame}>
      <PortalContainerContext.Provider value={frameRef}>
        {labels.map((label) => (
          <Button
            key={label}
            ref={(node) => {
              // Track whichever trigger is active for anchored overlays.
              if (node !== null && label === active) {
                triggerRef.current = node;
              }
            }}
            variant="subtle"
            pressed={label === active || undefined}
            onClick={() =>
              setActive((current) => (current === label ? null : label))
            }
          >
            {label}
          </Button>
        ))}
        {/* The ref is handed to anchored overlays, read only after mount. */}
        {/* eslint-disable react-hooks/refs */}
        {active !== null
          ? children({
              close: () => setActive(null),
              trigger: active,
              triggerRef,
            })
          : null}
        {/* eslint-enable react-hooks/refs */}
      </PortalContainerContext.Provider>
    </div>
  );
};
