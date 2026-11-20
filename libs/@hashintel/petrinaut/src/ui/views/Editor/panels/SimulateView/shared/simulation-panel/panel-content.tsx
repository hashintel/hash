import { use, useEffect, useRef } from "react";

import { css } from "@hashintel/ds-helpers/css";

import { usePetrinautNavigation } from "../../../../../../../react/navigation";
import { useUserSettings } from "../../../../../../../react/state/user-settings-context";
import {
  PanelContext,
  PanelExitingContext,
  type SimulationPanelProps,
} from "./panel-context";
import { isSimulateFullscreen } from "./panel-navigation";

const panelStyle = css({
  "--panel-horizontal-padding": "var(--spacing-5)",
  gridArea: "[1 / 1]",
  display: "flex",
  flexDirection: "column",
  minWidth: "[0]",
  minHeight: "[0]",
  height: "full",
  overflow: "hidden",
  backgroundColor: "neutral.s00",
  borderLeft: "[1px solid {colors.neutral.bd.subtle}]",
  "[data-simulation-workspace][data-fullscreen=true] &": {
    borderLeftWidth: "[0]",
  },
  outline: "none",
  userSelect: "text",
  "&[hidden]": { display: "none" },
  "&[data-animate=true]": {
    transition:
      "[transform 180ms cubic-bezier(0.16, 1, 0.3, 1), opacity 180ms ease-out]",
    "@starting-style": {
      opacity: "[0]",
      transform: "[translateX(16px)]",
    },
    "&[data-closing=true]": {
      opacity: "[0]",
      transform: "[translateX(16px)]",
      transitionDuration: "[120ms]",
      pointerEvents: "none",
    },
    "@media (prefers-reduced-motion: reduce)": {
      transition: "[none]",
      transform: "[none]",
    },
  },
});

export const PanelContent = ({
  title,
  onClose,
  closeDisabled,
  layer = "resource",
  initialFocusRef,
  children,
}: SimulationPanelProps) => {
  const { state } = usePetrinautNavigation();
  const closing = use(PanelExitingContext);
  const showAnimations = useUserSettings((settings) => settings.showAnimations);
  const panelRef = useRef<HTMLElement>(null);
  const hidden =
    layer === "resource" &&
    (state.overlay?.type === "create-scenario" ||
      state.overlay?.type === "create-experiment");
  const fullscreen = isSimulateFullscreen(state);

  useEffect(() => {
    if (hidden || closing) {
      return;
    }
    const panel = panelRef.current;
    const opener = document.activeElement;
    if (layer === "creation" || opener === document.body) {
      (initialFocusRef?.current ?? panel)?.focus({ preventScroll: true });
    }
    return () => {
      if (
        opener instanceof HTMLElement &&
        opener.isConnected &&
        (panel?.contains(document.activeElement) ||
          document.activeElement === document.body)
      ) {
        opener.focus({ preventScroll: true });
      }
    };
  }, [hidden, closing, initialFocusRef, layer]);

  useEffect(() => {
    const panel = panelRef.current;
    const activeElement = document.activeElement;
    if (
      !hidden &&
      fullscreen &&
      (activeElement === document.body || activeElement?.closest("[inert]"))
    ) {
      (initialFocusRef?.current ?? panel)?.focus({ preventScroll: true });
    }
  }, [fullscreen, hidden, initialFocusRef]);

  return (
    <PanelContext value={{ title, onClose, closeDisabled }}>
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- Escape from any control inside the panel closes it. */}
      <section
        ref={panelRef}
        aria-label={title}
        data-simulation-panel
        data-panel-layer={layer}
        data-closing={closing}
        data-animate={showAnimations}
        inert={closing}
        aria-hidden={closing || undefined}
        hidden={hidden}
        tabIndex={-1}
        onKeyDown={(event) => {
          if (!event.currentTarget.contains(event.target as Node)) {
            return;
          }
          event.stopPropagation();
          if (
            event.key === "Escape" &&
            !event.defaultPrevented &&
            !closeDisabled
          ) {
            onClose();
          }
        }}
        className={panelStyle}
      >
        {children}
      </section>
    </PanelContext>
  );
};
