import { Drawer as ArkDrawer } from "@ark-ui/react/drawer";
import { Portal } from "@ark-ui/react/portal";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

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

// How far each stacked drawer peeks out from behind the one on top of it.
const STACK_LAYER_OFFSET_PX = 20;

const translateForPosition = (
  position: DrawerPosition,
  offset: number,
): string => {
  const translateByPosition: Record<DrawerPosition, string> = {
    right: `${-offset}px 0`,
    left: `${offset}px 0`,
    top: `0 ${offset}px`,
    bottom: `0 ${-offset}px`,
  };
  return translateByPosition[position];
};

/**
 * Ark's drawer stack counts nested drawers regardless of edge, but we only want
 * the "stack of papers" offset to apply between drawers on the *same* edge. This
 * lightweight shared store tracks each open drawer's position, its measured
 * extent (width or height, whichever runs along its stacking axis) and open
 * order so a drawer can offset itself far enough to keep its edge peeking out
 * from behind the drawers stacked on top of it. Measuring from the DOM means
 * drawers with custom widths/heights stack correctly, not just the preset sizes.
 * Each entry also tracks whether its drawer is still open: a drawer that has
 * begun closing immediately stops offsetting the drawers beneath it, so they
 * un-nest in step with its slide-out instead of after it finishes and unmounts.
 */
type DrawerStackEntry = {
  order: number;
  position: DrawerPosition;
  extent: number;
  open: boolean;
};
const drawerStackEntries = new Map<string, DrawerStackEntry>();
const drawerStackListeners = new Set<() => void>();
let drawerStackOrderCounter = 0;

const emitDrawerStackChange = () => {
  for (const listener of drawerStackListeners) {
    listener();
  }
};

const subscribeToDrawerStack = (listener: () => void) => {
  drawerStackListeners.add(listener);
  return () => {
    drawerStackListeners.delete(listener);
  };
};

// Translations are resolved from the top of the stack downward: the top drawer
// doesn't move, and each drawer beneath it is translated so that at minimum 20px of edge is showing
const computeDrawerStackTranslate = (id: string): string => {
  const self = drawerStackEntries.get(id);
  if (!self) {
    return "0 0";
  }

  const stack = [...drawerStackEntries.values()]
    .filter((entry) => entry.position === self.position)
    .sort((a, b) => b.order - a.order);

  let aboveExtent = 0;
  let aboveTranslation = 0;
  let hasOpenAbove = false;
  for (const entry of stack) {
    const extent = entry.extent;
    const translation = hasOpenAbove
      ? Math.max(
          extent,
          aboveExtent + STACK_LAYER_OFFSET_PX + aboveTranslation,
        ) - extent
      : 0;

    if (entry.order === self.order) {
      return translateForPosition(self.position, translation);
    }

    if (entry.open) {
      aboveExtent = extent;
      aboveTranslation = translation;
      hasOpenAbove = true;
    }
  }

  return "0 0";
};

const useDrawerStackTranslate = (
  position: DrawerPosition,
  open: boolean,
): {
  ref: (node: HTMLDivElement | null) => void;
  translate: string;
} => {
  const id = useId();
  // The open order is captured once and kept stable across re-measures so a
  // drawer keeps its place in the stack even as its measured extent updates.
  const orderRef = useRef<number | null>(null);
  // The content element is tracked as state (via a callback ref) so the effect
  // below re-runs once it mounts — the drawer's `lazyMount` means the panel
  // isn't in the DOM on the first render.
  const [contentNode, setContentNode] = useState<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    if (!contentNode) {
      return;
    }
    if (orderRef.current === null) {
      drawerStackOrderCounter += 1;
      orderRef.current = drawerStackOrderCounter;
    }
    const order = orderRef.current;

    // Measure the panel's extent along its stacking axis and register it. A
    // `ResizeObserver` keeps it current if the panel is resized (e.g. a custom
    // width, or the viewport clamping the panel on small screens).
    const measure = () => {
      const extent =
        position === "left" || position === "right"
          ? contentNode.offsetWidth
          : contentNode.offsetHeight;
      const existing = drawerStackEntries.get(id);
      if (
        existing &&
        existing.order === order &&
        existing.position === position &&
        existing.extent === extent &&
        existing.open === open
      ) {
        return;
      }
      drawerStackEntries.set(id, { order, position, extent, open });
      emitDrawerStackChange();
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(contentNode);

    return () => {
      observer.disconnect();
      drawerStackEntries.delete(id);
      emitDrawerStackChange();
    };
  }, [id, position, contentNode, open]);

  const translate = useSyncExternalStore(
    subscribeToDrawerStack,
    () => computeDrawerStackTranslate(id),
    () => "0 0",
  );

  return { ref: setContentNode, translate };
};

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

  // `open` is passed to the stack tracker so a drawer stops offsetting the
  // drawers beneath it the moment it starts closing, letting them un-nest in
  // step with its slide-out.
  const { ref: stackContentRef, translate: stackTranslate } =
    useDrawerStackTranslate(position, open);

  const renderCloseButton = shouldCloseOn !== "none";
  const closeOnEscape = shouldCloseOn !== "none";
  const closeOnInteractOutside = shouldCloseOn === "closeButtonAndOverlay";

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
        <div className={classes.stackRoot} data-overlay-stack-root="">
          {showBackdrop && <ArkDrawer.Backdrop className={backdropClassName} />}
          <ArkDrawer.Positioner className={classes.positioner}>
            <ArkDrawer.Content
              {...ariaAttributes}
              ref={stackContentRef}
              data-drawer-position={position}
              className={cx(classes.content, className)}
              style={{ translate: stackTranslate }}
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
