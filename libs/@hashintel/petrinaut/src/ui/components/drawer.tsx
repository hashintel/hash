import {
  type ReactNode,
  use,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";

import { Button, PortalContainerContext } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

import { createValueStore } from "../../react/create-value-store";
import {
  Body,
  Card as PanelCard,
  closeButtonStyle,
  Footer,
  Header as PanelHeader,
  outerStyle,
} from "./panel-primitives";

// -- Drawer-specific styles ---------------------------------------------------

const overlayStyle = css({
  position: "absolute",
  top: "[0]",
  right: "[0]",
  bottom: "[0]",
  display: "flex",
  justifyContent: "flex-end",
  pointerEvents: "auto",
  padding: "[8px]",
  zIndex: 1100,
});

const enteringStyle = css({
  // No `forwards` — after the animation, the element returns to its base CSS
  // state (no transform). This avoids creating a permanent stacking context
  // that breaks `position: fixed` widgets inside the drawer (e.g., Monaco
  // suggest/hover popups). The natural flex position matches translateX(0).
  animation: "drawer-in 150ms ease-out",
});

const exitingStyle = css({
  animation: "drawer-out 100ms ease-in forwards",
});

const drawerOuterStyle = css({
  width: "[640px]",
  maxWidth: "[calc(90vw - 20px)]",
  height: "full",
});

// -- Animation wrapper --------------------------------------------------------

const AnimatedOverlay = ({
  open,
  onExited,
  children,
}: {
  open: boolean;
  onExited: () => void;
  children: ReactNode;
}) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      return;
    }
    const el = ref.current;
    if (!el) {
      onExited();
      return;
    }
    const handleEnd = () => onExited();
    el.addEventListener("animationend", handleEnd, { once: true });
    return () => el.removeEventListener("animationend", handleEnd);
  }, [open, onExited]);

  return (
    <div
      ref={ref}
      className={cx(overlayStyle, open ? enteringStyle : exitingStyle)}
    >
      {children}
    </div>
  );
};

// -- Root component -----------------------------------------------------------

interface DrawerRootProps {
  /** Whether the drawer is open */
  open: boolean;
  /** Called when the drawer should close */
  onClose: () => void;
  /** Drawer content (Card, Footer, etc.) */
  children: ReactNode;
  /** Additional class name for the outer container */
  className?: string;
}

const Root = ({
  open,
  onClose: _onClose,
  children,
  className,
}: DrawerRootProps) => {
  const portalContainerRef = use(PortalContainerContext);
  const [portalContainerStore] = useState(() =>
    createValueStore<HTMLElement | null>(null),
  );
  const portalContainer = useSyncExternalStore(
    (listener) => portalContainerStore.subscribe(listener),
    () => portalContainerStore.getSnapshot(),
    () => portalContainerStore.getSnapshot(),
  );
  const [mountedStore] = useState(() => createValueStore(false));
  const mounted = useSyncExternalStore(
    (listener) => mountedStore.subscribe(listener),
    () => mountedStore.getSnapshot(),
    () => mountedStore.getSnapshot(),
  );

  useLayoutEffect(() => {
    portalContainerStore.set(portalContainerRef?.current ?? null);
  }, [portalContainerRef, portalContainerStore]);

  useLayoutEffect(() => {
    if (open) {
      mountedStore.set(true);
    }
  }, [mountedStore, open]);

  const handleExited = () => {
    mountedStore.set(false);
  };

  if (!mounted || !portalContainer) {
    return null;
  }

  return createPortal(
    <AnimatedOverlay open={open} onExited={handleExited}>
      <div className={cx(outerStyle, drawerOuterStyle, className)}>
        {children}
      </div>
    </AnimatedOverlay>,
    portalContainer,
  );
};

// -- Card with close button ---------------------------------------------------

const Card = ({
  children,
  onClose,
}: {
  children: ReactNode;
  onClose: () => void;
}) => (
  <PanelCard
    closeButton={
      <Button
        className={closeButtonStyle}
        variant="ghost"
        size="sm"
        aria-label="Close"
        tooltip="Close"
        iconName="close"
        onClick={onClose}
      />
    }
  >
    {children}
  </PanelCard>
);

// -- Header -------------------------------------------------------------------

const Header = ({
  children,
  description,
}: {
  children: ReactNode;
  description?: ReactNode;
}) => <PanelHeader description={description}>{children}</PanelHeader>;

// -- Compound export ----------------------------------------------------------

export const Drawer = {
  Root,
  Card,
  Header,
  Body,
  Footer,
};
