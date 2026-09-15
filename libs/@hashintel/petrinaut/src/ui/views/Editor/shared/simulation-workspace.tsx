import {
  createContext,
  use,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

import { css } from "@hashintel/ds-helpers/css";

import { useElementSize } from "../../../../react/hooks/use-element-size";
import { usePetrinautNavigation } from "../../../../react/navigation";
import { UserSettingsContext } from "../../../../react/state/user-settings-context";
import { ResizeHandle } from "../../../resize/resize-handle";

const SimulationWorkspaceContext = createContext<
  HTMLElement | null | undefined
>(undefined);

export const useSimulationWorkspaceContainer = () =>
  use(SimulationWorkspaceContext);

export const SimulationWorkspace = ({ children }: { children: ReactNode }) => {
  const workspaceRef = useRef<HTMLDivElement>(null);
  const workspaceSize = useElementSize(workspaceRef);
  const [preferredWidth, setPreferredWidth] = useState<number | null>(null);
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const { state } = usePetrinautNavigation();
  const { showAnimations } = use(UserSettingsContext);
  const fullscreen =
    state.simulatePresentation === "fullscreen" &&
    (state.mode === "simulate" ||
      state.overlay?.type === "create-scenario" ||
      state.overlay?.type === "create-experiment");
  const workspaceWidth = workspaceSize?.width ?? 0;
  const maxWidth = Math.max(
    0,
    workspaceWidth - Math.min(280, workspaceWidth * 0.4),
  );
  const minWidth = Math.min(440, maxWidth);
  const panelWidth = Math.max(
    minWidth,
    Math.min(maxWidth, preferredWidth ?? Math.min(960, workspaceWidth * 0.6)),
  );

  return (
    <SimulationWorkspaceContext value={container}>
      <div
        ref={workspaceRef}
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
          style={
            {
              "--simulation-panel-width":
                workspaceSize === null ? "min(60%, 960px)" : `${panelWidth}px`,
            } as CSSProperties
          }
          className={css({
            position: "relative",
            display: "grid",
            flexShrink: "0",
            width: "[0]",
            minWidth: "[0]",
            minHeight: "[0]",
            "[data-animate=true] > &": {
              transition: "[width 200ms ease, min-width 200ms ease]",
              "&:has([data-resizing=true])": {
                transition: "[none]",
              },
              "@media (prefers-reduced-motion: reduce)": {
                transition: "[none]",
              },
            },
            "&:has(> [data-simulation-panel]:not([hidden]))": {
              width: "[var(--simulation-panel-width)]",
              "[data-fullscreen=true] > &": {
                width: "full",
                minWidth: "full",
              },
            },
          })}
        >
          {!fullscreen && (
            <div
              className={css({
                display: "none",
                position: "absolute",
                top: "[0]",
                bottom: "[0]",
                left: "[0]",
                width: "[0]",
                ":has(> [data-simulation-panel]:not([hidden])) > &": {
                  display: "block",
                },
              })}
            >
              <ResizeHandle
                edge="left"
                label="Resize simulation panel"
                size={panelWidth}
                onResize={setPreferredWidth}
                minSize={minWidth}
                maxSize={maxWidth}
              />
            </div>
          )}
        </div>
      </div>
    </SimulationWorkspaceContext>
  );
};
