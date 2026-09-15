import {
  createContext,
  use,
  useEffect,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

import { Button } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

import { usePetrinautNavigation } from "../../../../../../react/navigation";
import { useSimulationWorkspaceContainer } from "../../../shared/simulation-workspace";
import { simulationHeaderStyle } from "./simulation-header";

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
  const panelRef = useRef<HTMLElement>(null);
  const hidden =
    layer === "resource" &&
    (state.overlay?.type === "create-scenario" ||
      state.overlay?.type === "create-experiment");
  const fullscreen = state.simulatePresentation === "fullscreen";

  useEffect(() => {
    if (hidden) {
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
  }, [hidden, initialFocusRef, layer]);

  useEffect(() => {
    const panel = panelRef.current;
    if (!hidden && fullscreen && !panel?.contains(document.activeElement)) {
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
          gridArea: "[1 / 1]",
          display: "flex",
          flexDirection: "column",
          minWidth: "[0]",
          minHeight: "[0]",
          height: "full",
          overflow: "hidden",
          backgroundColor: "neutral.s00",
          borderLeft: "[1px solid {colors.neutral.bd.subtle}]",
          outline: "none",
          userSelect: "text",
          "&[hidden]": { display: "none" },
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
  const expanded = navigation.state.simulatePresentation === "fullscreen";
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
            (current) => ({
              ...current,
              simulatePresentation:
                current.simulatePresentation === "fullscreen"
                  ? "panel"
                  : "fullscreen",
            }),
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
          {title}
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
}: {
  children: ReactNode;
  className?: string;
}) => (
  <div
    className={cx(
      css({
        flex: "[1]",
        minHeight: "[0]",
        overflowY: "auto",
        overscrollBehavior: "contain",
        padding: "5",
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
