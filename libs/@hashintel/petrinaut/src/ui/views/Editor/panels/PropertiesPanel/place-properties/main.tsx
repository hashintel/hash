import { useSDCPNState } from "../../../../../../react/document/sdcpn-context";
import { VerticalSubViewsContainer } from "../../../../../components/sub-view/vertical/vertical-sub-views-container";
import { usePetrinautPresentation } from "../../../../shared/presentation-context";
import { PlacePropertiesContext } from "./context";
import {
  placeDynamicsSubView,
  placeInitialStateSubView,
  placeMainSubView,
  placeVisualizerSubView,
} from "./sub-views";

import type { SubView } from "../../../../../components/sub-view/types";
import type { Color, Place } from "@hashintel/petrinaut-core";

interface PlacePropertiesProps {
  place: Place;
  types: Color[];
}

export const PlaceProperties: React.FC<PlacePropertiesProps> = ({
  place,
  types,
}) => {
  const presentation = usePetrinautPresentation();
  const extensions = useSDCPNState((document) => document.extensions);

  const placeType =
    extensions.colors && place.colorId
      ? (types.find((tp) => tp.id === place.colorId) ?? null)
      : null;
  const baseSubViews: SubView[] = [
    {
      ...placeMainSubView,
      title: `${placeMainSubView.title} ${place.name}`,
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
