import { Dialog as ArkDialog, Portal } from "@ark-ui/react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import { usePortalContainerRef } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

/**
 * Right-anchored slide-over (drawer) built on `@ark-ui/react/dialog`, styled with
 * ds-helpers `css()` + design-system tokens. Mounted ===
 * open (caller conditionally renders); closes on Escape / backdrop / outside
 * click. Portals into the supply-chain layout scope so tokens resolve. Caller
 * owns header + body.
 *
 * Enter/exit animation: the panel slides via the positioner's `right` offset and
 * the backdrop fades, driven by a local `visible` flag. We deliberately animate
 * `right` (not `transform`) so no containing block is created — the data-table
 * modal renders inline inside the content with `position: fixed` and must stay
 * relative to the viewport. On close we play the exit animation, then defer the
 * caller's `onClose` (which unmounts us) until the transition finishes.
 */

const EXIT_MS = 200;

const SlideOverCloseContext = createContext<(() => void) | null>(null);

/** Animated close for descendants (Back / X buttons) — plays the slide-out. */
function useSlideOverClose(): () => void {
  const close = useContext(SlideOverCloseContext);
  return close ?? (() => {});
}

/**
 * Render-prop access to the slide-over's animated close. Use for in-panel Back /
 * ✕ controls (e.g. a ds `Button`) so they play the exit slide instead of
 * unmounting instantly — pass `close` to the control's `onClick`. Must be
 * rendered inside `<SlideOver>`.
 */
export const SlideOverClose = ({
  children,
}: {
  children: (close: () => void) => ReactNode;
}) => {
  const close = useSlideOverClose();
  return <>{children(close)}</>;
};

interface SlideOverProps {
  onClose: () => void;
  children: ReactNode;
  /** Optional className for the content panel (e.g. width overrides). */
  className?: string;
  /** Accessible label for the dialog. */
  label?: string;
}

const backdropBase = css({
  position: "fixed",
  inset: "0",
  bg: "neutral.a80",
  zIndex: "overlay",
  opacity: "[0]",
  transition: "[opacity 200ms ease-out]",
});
const backdropVisible = css({ opacity: "[1]" });

const positionerBase = css({
  position: "fixed",
  top: "0",
  bottom: "0",
  right: "[-960px]",
  display: "flex",
  zIndex: "modal",
  transition: "[right 200ms ease-out]",
});
const positionerVisible = css({ right: "0" });

const contentStyles = css({
  height: "full",
  width: "[960px]",
  maxWidth: "[90vw]",
  overflowY: "auto",
  bg: "bgSolid.min",
  boxShadow: "2xl",
});

export const SlideOver = ({
  onClose,
  children,
  className,
  label,
}: SlideOverProps) => {
  const portalRef = usePortalContainerRef();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const requestClose = useCallback(() => {
    setVisible(false);
    window.setTimeout(onClose, EXIT_MS);
  }, [onClose]);

  return (
    <SlideOverCloseContext.Provider value={requestClose}>
      <ArkDialog.Root
        open
        closeOnEscape
        closeOnInteractOutside
        onOpenChange={(details) => {
          if (!details.open) {
            requestClose();
          }
        }}
      >
        <Portal container={portalRef}>
          <ArkDialog.Backdrop
            className={cx(backdropBase, visible && backdropVisible)}
          />
          <ArkDialog.Positioner
            className={cx(positionerBase, visible && positionerVisible)}
          >
            <ArkDialog.Content
              className={cx(contentStyles, className)}
              aria-label={label}
            >
              {children}
            </ArkDialog.Content>
          </ArkDialog.Positioner>
        </Portal>
      </ArkDialog.Root>
    </SlideOverCloseContext.Provider>
  );
};
