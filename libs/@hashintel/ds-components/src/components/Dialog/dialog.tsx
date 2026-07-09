import { Dialog as ArkDialog } from "@ark-ui/react/dialog";
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
import { styles } from "./dialog.recipe";

export type DialogSize = "xs" | "sm" | "md" | "lg" | "xl" | "fullScreen";

const backdropClassName = overlayPartsStyles({ component: "dialog" }).backdrop;

const DialogRoot = ({
  className,
  size = "md",
  variant = "partitionedFooter",
  children,
  shouldCloseOn = "closeButtonAndOverlay",
  loading,
  onClose,
  initialFocusRef,
  returnFocusRef,
  onKeyDown,
  ...ariaAttributes
}: {
  className?: string;
  size?: DialogSize;
  onKeyDown?: React.KeyboardEventHandler<Element>;
  variant?: "partitionedFooter" | "plain";
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

  const classes = useMemo(() => styles({ size }), [size]);

  const renderCloseButton = shouldCloseOn !== "none";
  const closeOnEscape = shouldCloseOn !== "none";
  const closeOnInteractOutside = shouldCloseOn === "closeButtonAndOverlay";

  // The parent mounts/unmounts the Dialog to open/close it, but Ark only plays
  // the open/close animations when `open` actually transitions. So we drive
  // `open` internally: it starts closed and flips open on the next frame
  // (playing the enter animation), and every close request flips it back to
  // closed to play the exit animation. The parent-facing `onClose` is deferred
  // until that exit animation completes, so the dialog finishes fading out
  // before it unmounts.
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
    <ArkDialog.Root
      open={open}
      lazyMount
      unmountOnExit
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
        <div className={classes.stackRoot} data-overlay-stack-root="">
          <ArkDialog.Backdrop className={backdropClassName} />
          <ArkDialog.Positioner className={classes.positioner}>
            <ArkDialog.Content
              {...ariaAttributes}
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
                Title={ArkDialog.Title}
                Description={ArkDialog.Description}
                componentName="Dialog"
              >
                {children}
              </OverlaySections>
            </ArkDialog.Content>
          </ArkDialog.Positioner>
        </div>
      </Portal>
    </ArkDialog.Root>
  );
};

export const Dialog = Object.assign(DialogRoot, {
  Header: OverlayHeader,
  Body: OverlayBody,
  Footer: OverlayFooter,
});
