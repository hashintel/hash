import { Drawer as ArkDrawer } from "@ark-ui/react/drawer";
import { Portal } from "@ark-ui/react/portal";
import { useEffect, useMemo, useState } from "react";

import { cx } from "@hashintel/ds-helpers/css";

import {
  OverlayBody,
  OverlayFooter,
  OverlayHeader,
  OverlaySections,
  type OverlayBodyProps,
  type OverlayFooterProps,
  type OverlayHeaderProps,
  type OverlayShouldCloseOn,
} from "../../util/overlay-parts";
import { overlayPartsStyles } from "../../util/overlay-parts.recipe";
import { usePortalContainerRef } from "../../util/portal-container-context";
import { styles } from "./drawer.recipe";

export type DrawerSize = "sm" | "md" | "lg" | "xl";

export type DrawerPosition = "left" | "top" | "right" | "bottom";

const backdropClassName = overlayPartsStyles({ component: "drawer" }).backdrop;

// Which way the panel is swiped to dismiss, per anchor edge. Ark resolves
// "start"/"end" to left/right based on the writing direction.
const swipeDirectionByPosition = {
  right: "end",
  left: "start",
  top: "up",
  bottom: "down",
} as const;

const DrawerRoot = ({
  className,
  size = "md",
  variant = "partitionedFooter",
  position = "right",
  children,
  showBackdrop = true,
  shouldCloseOn = "closeButtonAndOverlay",
  loading,
  onClose,
  initialFocusRef,
  returnFocusRef,
  onKeyDown,
  ...ariaAttributes
}: {
  className?: string;
  size?: DrawerSize;
  onKeyDown?: React.KeyboardEventHandler<Element>;
  variant?: "partitionedFooter" | "plain";
  /** Which viewport edge the drawer is anchored to. Defaults to `"right"`. */
  position?: DrawerPosition;
  /** Render the dimmed overlay behind the drawer. Defaults to `true`. */
  showBackdrop?: boolean;
  children:
    | readonly [
        React.ReactElement<OverlayHeaderProps, typeof OverlayHeader>,
        React.ReactElement<OverlayBodyProps, typeof OverlayBody>,
        React.ReactElement<OverlayFooterProps, typeof OverlayFooter>?,
      ]
    | readonly [
        React.ReactElement<OverlayBodyProps, typeof OverlayBody>,
        React.ReactElement<OverlayFooterProps, typeof OverlayFooter>?,
      ]
    | React.ReactElement<OverlayBodyProps, typeof OverlayBody>;
  shouldCloseOn?: OverlayShouldCloseOn;
  loading?: boolean;
  onClose?: () => void;
  initialFocusRef?: React.RefObject<HTMLElement>;
  returnFocusRef?: React.RefObject<HTMLElement>;
} & React.AriaAttributes) => {
  const portalContainerRef = usePortalContainerRef();

  const classes = useMemo(() => styles({ size, position }), [size, position]);

  const renderCloseButton = shouldCloseOn !== "none";
  const closeOnEscape = shouldCloseOn !== "none";
  const closeOnInteractOutside = shouldCloseOn === "closeButtonAndOverlay";

  // The parent mounts/unmounts the Drawer to open/close it, but Ark only plays
  // the slide animations when `open` actually transitions. So we drive `open`
  // internally: it starts closed and flips open on the next frame (playing the
  // enter animation), and every close request flips it back to closed to play
  // the exit animation. The parent-facing `onClose` is deferred until that exit
  // animation completes, so the panel finishes sliding out before it unmounts.
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setOpen(true);
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, []);

  const requestClose = () => {
    setOpen(false);
  };

  return (
    <ArkDrawer.Root
      open={open}
      lazyMount
      unmountOnExit
      swipeDirection={swipeDirectionByPosition[position]}
      // Without a backdrop the drawer is non-modal, so the page behind stays interactive
      // But we still want to keep focus trapped even when modal={false}
      modal={showBackdrop}
      trapFocus
      closeOnEscape={closeOnEscape}
      closeOnInteractOutside={closeOnInteractOutside}
      onOpenChange={(event) => {
        if (!event.open) {
          requestClose();
        }
      }}
      onExitComplete={() => {
        onClose?.();
      }}
      initialFocusEl={
        initialFocusRef ? () => initialFocusRef.current : undefined
      }
      finalFocusEl={returnFocusRef ? () => returnFocusRef.current : undefined}
    >
      <Portal container={portalContainerRef}>
        <div className={classes.stackRoot}>
          {showBackdrop && <ArkDrawer.Backdrop className={backdropClassName} />}
          <ArkDrawer.Positioner className={classes.positioner}>
            <ArkDrawer.Content
              {...ariaAttributes}
              data-drawer-position={position}
              className={cx(classes.content, className)}
              aria-busy={loading ?? undefined}
              onKeyDown={onKeyDown}
            >
              <OverlaySections
                size={size}
                variant={variant}
                onClose={requestClose}
                renderCloseButton={renderCloseButton}
                loading={loading}
                Title={ArkDrawer.Title}
                Description={ArkDrawer.Description}
                componentName="Drawer"
              >
                {children}
              </OverlaySections>
            </ArkDrawer.Content>
          </ArkDrawer.Positioner>
        </div>
      </Portal>
    </ArkDrawer.Root>
  );
};

export const Drawer = Object.assign(DrawerRoot, {
  Header: OverlayHeader,
  Body: OverlayBody,
  Footer: OverlayFooter,
});
