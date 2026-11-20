import { Icon } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import {
  usePetrinautNavigate,
  usePetrinautNavigationState,
} from "../../../../../../../react/navigation";
import { isSimulateFullscreen, panelSimulateView } from "./panel-navigation";

import type { SimulateViewMode } from "../../../../../../../react/state/editor-context";

const sectionLabels: Record<SimulateViewMode, string> = {
  scenarios: "Scenarios",
  experiments: "Experiments",
  metrics: "Metrics",
};

export const SimulationPanelTitle = ({ title }: { title: string }) => {
  const expanded = usePetrinautNavigationState(isSimulateFullscreen);
  const simulateView = usePetrinautNavigationState(panelSimulateView);
  const navigate = usePetrinautNavigate();
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
              {sectionLabels[simulateView]}
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
