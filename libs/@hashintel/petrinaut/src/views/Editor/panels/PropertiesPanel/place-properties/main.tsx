import { css } from "@hashintel/ds-helpers/css";

import type { SubView } from "../../../../../components/sub-view/types";
import { VerticalSubViewsContainer } from "../../../../../components/sub-view/vertical/vertical-sub-views-container";
import type { Color, Place } from "../../../../../core/types/sdcpn";
import { useIsReadOnly } from "../../../../../state/use-is-read-only";
import { PlacePropertiesProvider } from "./context";
import { placeMainContentSubView } from "./subviews/main";
import { placeInitialStateSubView } from "./subviews/place-initial-state/subview";
import { placeVisualizerSubView } from "./subviews/place-visualizer/subview";

const containerStyle = css({
  display: "flex",
  flexDirection: "column",
  height: "[100%]",
  minHeight: "[0]",
});

const subViews: SubView[] = [
  placeMainContentSubView,
  placeInitialStateSubView,
  placeVisualizerSubView,
];

interface PlacePropertiesProps {
  place: Place;
  types: Color[];
  updatePlace: (placeId: string, updateFn: (place: Place) => void) => void;
}

export const PlaceProperties: React.FC<PlacePropertiesProps> = ({
  place,
  types,
  updatePlace,
}) => {
  const isReadOnly = useIsReadOnly();

  const placeType = place.colorId
    ? (types.find((tp) => tp.id === place.colorId) ?? null)
    : null;

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
