import { use } from "react";

import { Button } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import {
  usePetrinautNavigate,
  usePetrinautNavigationState,
} from "../../../../../../../react/navigation/navigation";
import { PanelContext } from "./panel-context";
import { isSimulateFullscreen, panelSimulateView } from "./panel-navigation";

export const SimulationPanelControls = () => {
  const expanded = usePetrinautNavigationState(isSimulateFullscreen);
  const navigate = usePetrinautNavigate();
  const { onClose, closeDisabled } = use(PanelContext);
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
          navigate(
            (current) => {
              const simulateView = panelSimulateView(current);
              return {
                ...current,
                mode: "simulate",
                simulateView,
                simulateResource:
                  simulateView === current.simulateView
                    ? current.simulateResource
                    : null,
                simulatePresentation: isSimulateFullscreen(current)
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
