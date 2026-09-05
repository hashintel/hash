import {
  defaultPetrinautNavigationState,
  type PetrinautNavigationController,
  type PetrinautNavigationState,
} from "../../react/navigation";

/** The app-location subset supported by the compact Preview. */
export type PetrinautPreviewNavigationState = Pick<
  PetrinautNavigationState,
  "scenarioId" | "subnetId" | "selection"
>;

const toFullNavigationState = (
  state: Readonly<PetrinautPreviewNavigationState>,
  mode: "edit" | "simulate",
): PetrinautNavigationState => ({
  ...defaultPetrinautNavigationState,
  mode,
  simulateView: "scenarios",
  scenarioId: state.scenarioId,
  subnetId: state.subnetId,
  selection: state.selection,
});

export const toPreviewNavigationState = (
  state: Readonly<PetrinautNavigationState>,
): PetrinautPreviewNavigationState => ({
  scenarioId: state.scenarioId,
  subnetId: state.subnetId,
  selection: state.selection,
});

/** Adapts Preview's deliberately smaller URL contract to the shared providers. */
export const createPreviewNavigationAdapter = (
  controller: PetrinautNavigationController<PetrinautPreviewNavigationState>,
  mode: "edit" | "simulate" = "edit",
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
