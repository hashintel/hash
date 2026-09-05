import { use } from "react";

import { css } from "@hashintel/ds-helpers/css";

import { SDCPNContext } from "../../../../../../react/state/sdcpn-context";
import { useIsReadOnly } from "../../../../../../react/state/use-is-read-only";
import { createDeferredSubView } from "../../../../../components/sub-view/deferred-sub-view";
import { VerticalSubViewsContainer } from "../../../../../components/sub-view/vertical/vertical-sub-views-container";
import { usePetrinautPresentation } from "../../../../shared/presentation-context";
import { PlacePropertiesProvider } from "./context";
import { placeMainContentSubView } from "./subviews/main";
import { placeInitialStateSubView } from "./subviews/place-initial-state/subview";

import type { PetrinautMutations } from "../../../../../../react";
import type { SubView } from "../../../../../components/sub-view/types";
import type { Color, Place } from "@hashintel/petrinaut-core";

const containerStyle = css({
  display: "flex",
  flexDirection: "column",
  height: "[100%]",
  minHeight: "[0]",
});

const baseSubViews: SubView[] = [
  placeMainContentSubView,
  placeInitialStateSubView,
];

const placeVisualizerSubView = createDeferredSubView({
  id: "place-visualizer",
  headerActionMutates: true,
  title: "Visualizer",
  tooltip:
    "Custom visualization of tokens in this place, defined by visualizer code.",
  defaultCollapsed: true,
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

interface PlacePropertiesProps {
  place: Place;
  types: Color[];
  updatePlace: PetrinautMutations["updatePlace"];
}

export const PlaceProperties: React.FC<PlacePropertiesProps> = ({
  place,
  types,
  updatePlace,
}) => {
  const isReadOnly = useIsReadOnly();
  const presentation = usePetrinautPresentation();
  const { extensions } = use(SDCPNContext);

  const placeType =
    extensions.colors && place.colorId
      ? (types.find((tp) => tp.id === place.colorId) ?? null)
      : null;
  const subViews =
    extensions.colors && presentation.showSourceCode
      ? [...baseSubViews, placeVisualizerSubView]
      : baseSubViews;

  return (
    <div className={containerStyle}>
      <PlacePropertiesProvider
        place={place}
        placeType={placeType}
        types={types}
        isReadOnly={isReadOnly}
        updatePlace={updatePlace}
      >
        <VerticalSubViewsContainer
          name="place-properties"
          subViews={subViews}
        />
      </PlacePropertiesProvider>
    </div>
  );
};
