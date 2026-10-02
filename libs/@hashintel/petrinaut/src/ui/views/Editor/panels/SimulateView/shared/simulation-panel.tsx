import {
  createContext,
  use,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

import { Button, Icon } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

import { usePetrinautNavigation } from "../../../../../../react/navigation";
import { UserSettingsContext } from "../../../../../../react/state/user-settings-context";
import { useSimulationWorkspaceContainer } from "../../../shared/simulation-workspace";
import { simulationHeaderStyle } from "./simulation-header";
import { usePrefersReducedMotion } from "./use-prefers-reduced-motion";

const PanelExitingContext = createContext(false);
const panelExitDuration = 120;

export const SimulationPanelPresence = ({
  children,
}: {
  children: ReactNode;
}) => {
  const { showAnimations } = use(UserSettingsContext);
  const reducedMotion = usePrefersReducedMotion();
  const animate = showAnimations && !reducedMotion;
  const [retained, setRetained] = useState(children);
  const present =
    children !== null && children !== undefined && children !== false;
  if (present && retained !== children) {
    setRetained(children);
  }
  useEffect(() => {
    if (present || retained === null) {
      return;
    }
    const timer = setTimeout(
      () => setRetained(null),
      animate ? panelExitDuration : 0,
    );
    return () => clearTimeout(timer);
  }, [present, retained, animate]);
  return (
    <PanelExitingContext value={!present}>
      {present ? children : animate ? retained : null}
    </PanelExitingContext>
  );
};

interface SimulationPanelProps {
  title: string;
  onClose: () => void;
  closeDisabled?: boolean;
  layer?: "resource" | "creation";
  initialFocusRef?: RefObject<HTMLElement | null>;
  children: ReactNode;
}

const PanelContext = createContext<
  Pick<SimulationPanelProps, "title" | "onClose" | "closeDisabled">
>({
  title: "",
  onClose: () => {},
});

const PanelContent = ({
  title,
  onClose,
  closeDisabled,
  layer = "resource",
  initialFocusRef,
  children,
}: SimulationPanelProps) => {
  const { state } = usePetrinautNavigation();
  const closing = use(PanelExitingContext);
  const { showAnimations } = use(UserSettingsContext);
  const panelRef = useRef<HTMLElement>(null);
  const hidden =
    layer === "resource" &&
    (state.overlay?.type === "create-scenario" ||
      state.overlay?.type === "create-experiment");
  const fullscreen =
    state.mode === "simulate" && state.simulatePresentation === "fullscreen";

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
      <section
        ref={panelRef}
        role="region"
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
        className={css({
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
        })}
      >
        {children}
      </section>
    </PanelContext>
  );
};

const SimulationPanelRoot = (props: SimulationPanelProps) => {
  const container = useSimulationWorkspaceContainer();
  if (container === null) {
    return null;
  }
  const panel = <PanelContent {...props} />;
  return container === undefined ? panel : createPortal(panel, container);
};

export const SimulationPanelControls = () => {
  const navigation = usePetrinautNavigation();
  const { onClose, closeDisabled } = use(PanelContext);
  const expanded =
    navigation.state.mode === "simulate" &&
    navigation.state.simulatePresentation === "fullscreen";
  const label = expanded ? "Show as panel" : "Expand to fullscreen";

  return (
    <div
      className={css({
        display: "flex",
        alignItems: "center",
        gap: "1",
        flexShrink: "0",
      })}
    >
      <Button
        variant="ghost"
        size="xs"
        iconName={expanded ? "collapse" : "expand"}
        aria-label={label}
        tooltip={label}
        onClick={() =>
          navigation.navigate(
            (current) => {
              const simulateView =
                current.overlay?.type === "create-scenario"
                  ? "scenarios"
                  : current.overlay?.type === "create-experiment"
                    ? "experiments"
                    : current.simulateView;
              return {
                ...current,
                mode: "simulate",
                simulateView,
                simulateResource:
                  simulateView === current.simulateView
                    ? current.simulateResource
                    : null,
                simulatePresentation:
                  current.mode === "simulate" &&
                  current.simulatePresentation === "fullscreen"
                    ? "panel"
                    : "fullscreen",
              };
            },
            { cause: "user", action: "simulation-presentation" },
          )
        }
      />
      <Button
        variant="ghost"
        size="xs"
        iconName="close"
        aria-label="Close panel"
        tooltip="Close panel"
        disabled={closeDisabled}
        onClick={onClose}
      />
    </div>
  );
};

export const SimulationPanelTitle = ({ title }: { title: string }) => {
  const { state, navigate } = usePetrinautNavigation();
  const expanded =
    state.mode === "simulate" && state.simulatePresentation === "fullscreen";
  const section =
    state.overlay?.type === "create-scenario"
      ? "Scenarios"
      : state.overlay?.type === "create-experiment"
        ? "Experiments"
        : {
            scenarios: "Scenarios",
            experiments: "Experiments",
            metrics: "Metrics",
            "status-views": "Status views",
          }[state.simulateView];
  return (
    <span
      className={css({
        display: "flex",
        alignItems: "center",
        minWidth: "[0]",
      })}
    >
      <span
        data-simulation-breadcrumb
        data-expanded={expanded}
        aria-hidden={!expanded}
        className={css({
          display: "grid",
          gridTemplateColumns: "[0fr]",
          opacity: "[0]",
          transform: "[translateX(-4px)]",
          flexShrink: "0",
          "&[data-expanded=true]": {
            gridTemplateColumns: "[1fr]",
            opacity: "[1]",
            transform: "[translateX(0)]",
          },
          "[data-simulation-workspace][data-animate=true] &": {
            transition:
              "[grid-template-columns 200ms ease, opacity 160ms ease, transform 200ms ease]",
            "@media (prefers-reduced-motion: reduce)": { transition: "[none]" },
          },
        })}
      >
        <span className={css({ minWidth: "[0]", overflow: "hidden" })}>
          <span
            className={css({
              display: "flex",
              alignItems: "center",
              gap: "2",
              paddingRight: "3",
              whiteSpace: "nowrap",
              fontWeight: "normal",
              color: "neutral.s90",
            })}
          >
            <button
              type="button"
              tabIndex={expanded ? 0 : -1}
              onClick={(event) => {
                event.currentTarget
                  .closest<HTMLElement>("[data-simulation-panel]")
                  ?.focus({ preventScroll: true });
                navigate(
                  { simulatePresentation: "panel" },
                  { cause: "user", action: "simulation-presentation" },
                );
              }}
              className={css({
                appearance: "none",
                padding: "[0]",
                border: "[0]",
                background: "[transparent]",
                font: "[inherit]",
                color: "[inherit]",
                cursor: "pointer",
                textDecoration: "underline",
                textDecorationColor: "[transparent]",
                "[data-simulation-panel][data-animate=true] &": {
                  transition:
                    "[color 140ms ease-out, text-decoration-color 140ms ease-out]",
                  "@media (prefers-reduced-motion: reduce)": {
                    transition: "[none]",
                  },
                },
                _hover: {
                  color: "neutral.s120",
                  textDecorationColor: "[currentColor]",
                },
                _focusVisible: {
                  outline: "[1px solid currentColor]",
                  outlineOffset: "[-1px]",
                },
              })}
            >
              {section}
            </button>
            <Icon name="chevronRight" size="xs" />
          </span>
        </span>
      </span>
      <span
        className={css({
          minWidth: "[0]",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        })}
      >
        {title}
      </span>
    </span>
  );
};

const PanelHeader = ({ description }: { description?: ReactNode }) => {
  const { title } = use(PanelContext);
  return (
    <header
      className={cx(
        simulationHeaderStyle({ withDescription: !!description }),
        css({
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          paddingX: "5",
          paddingY: "3",
          borderBottom: "[1px solid {colors.neutral.bd.subtle}]",
        }),
      )}
    >
      <div
        className={css({
          display: "flex",
          alignItems: "center",
          gap: "3",
          minWidth: "[0]",
        })}
      >
        <h2
          className={css({
            margin: "[0]",
            flex: "[1]",
            minWidth: "[0]",
            fontSize: "sm",
            fontWeight: "semibold",
            color: "neutral.s120",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          })}
        >
          <SimulationPanelTitle title={title} />
        </h2>
        <SimulationPanelControls />
      </div>
      {description ? (
        <p
          className={css({
            marginTop: "2",
            marginBottom: "[0]",
            fontSize: "sm",
            color: "neutral.s90",
          })}
        >
          {description}
        </p>
      ) : null}
    </header>
  );
};

const PanelBody = ({
  children,
  className,
  withPadding = true,
  scrollable = true,
}: {
  children: ReactNode;
  className?: string;
  withPadding?: boolean;
  scrollable?: boolean;
}) => (
  <div
    className={cx(
      css({
        flex: "[1]",
        minHeight: "[0]",
        overflowY: scrollable ? "auto" : "hidden",
        overscrollBehavior: "contain",
        padding: withPadding ? "5" : "[0]",
      }),
      className,
    )}
  >
    {children}
  </div>
);

const PanelFooter = ({
  actions,
  secondaryActions,
}: {
  actions: ReactNode;
  secondaryActions?: ReactNode;
}) => (
  <footer
    className={css({
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: "3",
      flexShrink: "0",
      paddingX: "5",
      paddingY: "3",
      borderTop: "[1px solid {colors.neutral.bd.subtle}]",
    })}
  >
    <div
      className={css({
        display: "flex",
        alignItems: "center",
        gap: "2",
        minWidth: "[0]",
      })}
    >
      {secondaryActions}
    </div>
    <div
      className={css({
        display: "flex",
        alignItems: "center",
        gap: "2",
        minWidth: "[0]",
      })}
    >
      {actions}
    </div>
  </footer>
);

export const SimulationPanel = Object.assign(SimulationPanelRoot, {
  Header: PanelHeader,
  Body: PanelBody,
  Footer: PanelFooter,
});
