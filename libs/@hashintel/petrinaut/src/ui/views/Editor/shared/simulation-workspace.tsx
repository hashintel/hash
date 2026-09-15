import { createContext, use, useState, type ReactNode } from "react";

import { css } from "@hashintel/ds-helpers/css";

import { usePetrinautNavigation } from "../../../../react/navigation";
import { UserSettingsContext } from "../../../../react/state/user-settings-context";

const SimulationWorkspaceContext = createContext<
  HTMLElement | null | undefined
>(undefined);

export const useSimulationWorkspaceContainer = () =>
  use(SimulationWorkspaceContext);

export const SimulationWorkspace = ({ children }: { children: ReactNode }) => {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const { state } = usePetrinautNavigation();
  const { showAnimations } = use(UserSettingsContext);
  const fullscreen =
    state.simulatePresentation === "fullscreen" &&
    (state.mode === "simulate" ||
      state.overlay?.type === "create-scenario" ||
      state.overlay?.type === "create-experiment");

  return (
    <SimulationWorkspaceContext value={container}>
      <div
        data-simulation-workspace
        data-fullscreen={fullscreen}
        data-animate={showAnimations}
        className={css({
          position: "relative",
          display: "flex",
          flex: "[1]",
          minWidth: "[0]",
          minHeight: "[0]",
          overflow: "hidden",
        })}
      >
        <div
          inert={fullscreen}
          className={css({
            position: "relative",
            display: "flex",
            flex: "[1]",
            minWidth: "[0]",
            minHeight: "[0]",
            overflow: "hidden",
          })}
        >
          {children}
        </div>
        <div
          ref={setContainer}
          data-simulation-panel-slot
          className={css({
            position: "relative",
            display: "grid",
            flexShrink: "0",
            width: "[0]",
            minWidth: "[0]",
            minHeight: "[0]",
            overflow: "hidden",
            "[data-animate=true] > &": {
              transition: "[width 200ms ease, min-width 200ms ease]",
              "@media (prefers-reduced-motion: reduce)": {
                transition: "[none]",
              },
            },
            "&:has(> [data-simulation-panel]:not([hidden]))": {
              width: "[min(60%, 960px)]",
              minWidth: "[min(440px, 100%)]",
              "[data-fullscreen=true] > &": {
                width: "full",
                minWidth: "full",
              },
            },
          })}
        />
      </div>
    </SimulationWorkspaceContext>
  );
};
