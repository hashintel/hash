import type { PetrinautNavigationState } from "../../../../../../../react/navigation/navigation";
import type { SimulateViewMode } from "../../../../../../../react/state/editor-context";

export const isSimulateFullscreen = (state: PetrinautNavigationState) =>
  state.mode === "simulate" && state.simulatePresentation === "fullscreen";

/**
 * The Simulate tab the open panel belongs to. A creation panel belongs to the
 * tab of what it creates, whichever tab is open behind it.
 */
export const panelSimulateView = (
  state: PetrinautNavigationState,
): SimulateViewMode =>
  state.overlay?.type === "create-scenario"
    ? "scenarios"
    : state.overlay?.type === "create-experiment"
      ? "experiments"
      : state.simulateView;
