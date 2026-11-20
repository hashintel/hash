import { use } from "react";

import { SDCPNContext } from "../../../../../../react/state/sdcpn-context";
import { createDeferredSubView } from "../../../../../components/sub-view/deferred-sub-view";
import { VerticalSubViewsContainer } from "../../../../../components/sub-view/vertical/vertical-sub-views-container";
import { usePetrinautPresentation } from "../../../../shared/presentation-context";
import { PlacePropertiesContext } from "./context";
import { placeMainContentSubView } from "./subviews/main";
import { placeDynamicsSubView } from "./subviews/place-dynamics/subview";
import { placeInitialStateSubView } from "./subviews/place-initial-state/subview";

import type { SubView } from "../../../../../components/sub-view/types";
import type { Color, Place } from "@hashintel/petrinaut-core";

const placeVisualizerSubView = createDeferredSubView({
  id: "place-visualizer",
  canMaximize: true,
  headerActionMutates: true,
  title: "Visualizer",
  tooltip:
    "Custom visualization of tokens in this place, defined by visualizer code.",
  defaultCollapsed: true,
  retainOnCollapse: true,
  alwaysShowHeaderAction: true,
  hasHeaderAction: true,
  resizable: {
    minHeight: 200,
    maxHeight: 1200,
    defaultHeight: 300,
  },
  load: async () =>
    (await import("./subviews/place-visualizer/subview"))
      .placeVisualizerSubView,
});

placeVisualizerSubView.preload();

interface PlacePropertiesProps {
  place: Place;
  types: Color[];
}

export const PlaceProperties: React.FC<PlacePropertiesProps> = ({
  place,
  types,
}) => {
  const presentation = usePetrinautPresentation();
  const { extensions } = use(SDCPNContext);

  const placeType =
    extensions.colors && place.colorId
      ? (types.find((tp) => tp.id === place.colorId) ?? null)
      : null;
  const baseSubViews: SubView[] = [
    {
      ...placeMainContentSubView,
      title: `${placeMainContentSubView.title} ${place.name}`,
    },
    ...(extensions.colors && extensions.dynamics ? [placeDynamicsSubView] : []),
    placeInitialStateSubView,
  ];
  const subViews =
    extensions.colors && presentation.showSourceCode
      ? [...baseSubViews, placeVisualizerSubView]
      : baseSubViews;

  return (
    <PlacePropertiesContext value={{ place, placeType, types }}>
      <VerticalSubViewsContainer
        key={place.id}
        name="place-properties"
        subViews={subViews}
      />
    </PlacePropertiesContext>
  );
};
