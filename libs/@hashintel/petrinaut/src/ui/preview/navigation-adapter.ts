import {
  defaultPetrinautNavigationState,
  type PetrinautNavigationController,
  type PetrinautNavigationState,
} from "../../react/navigation";

/** The app-location subset supported by the compact Preview. */
export type PetrinautPreviewNavigationState = Pick<
  PetrinautNavigationState,
  "scenarioId" | "componentId" | "selection"
>;

type PreviewMode = PetrinautNavigationState["mode"];

const toFullNavigationState = (
  state: Readonly<PetrinautPreviewNavigationState>,
  mode: PreviewMode,
): PetrinautNavigationState => ({
  ...defaultPetrinautNavigationState,
  mode,
  simulateView: "scenarios",
  scenarioId: state.scenarioId,
  componentId: state.componentId,
  selection: state.selection,
});

export const toPreviewNavigationState = (
  state: Readonly<PetrinautNavigationState>,
): PetrinautPreviewNavigationState => ({
  scenarioId: state.scenarioId,
  componentId: state.componentId,
  selection: state.selection,
});

/** Adapts Preview's deliberately smaller URL contract to the shared providers. */
export const createPreviewNavigationAdapter = (
  controller: PetrinautNavigationController<PetrinautPreviewNavigationState>,
  mode: PreviewMode,
): PetrinautNavigationController => ({
  state: toFullNavigationState(controller.state, mode),
  historyPolicy: controller.historyPolicy,
  onNavigate: (update, options) => {
    controller.onNavigate(
      (state) =>
        toPreviewNavigationState(update(toFullNavigationState(state, mode))),
      options,
    );
  },
});
