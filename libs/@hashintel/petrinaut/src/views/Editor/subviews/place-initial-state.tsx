import { css } from "@hashintel/ds-helpers/css";

import type { SubView } from "../../../components/sub-view/types";
import { useSimulationStore } from "../../../state/simulation-provider";
import { InitialStateEditor } from "../panels/PropertiesPanel/initial-state-editor";
import { usePlacePropertiesContext } from "../panels/PropertiesPanel/place-properties-context";

const inputStyle = css({
  fontSize: "[14px]",
  padding: "[6px 8px]",
  borderRadius: "[4px]",
  width: "[100%]",
  boxSizing: "border-box",
  border: "[1px solid rgba(0, 0, 0, 0.1)]",
  backgroundColor: "[rgba(0, 0, 0, 0.05)]",
  cursor: "not-allowed",
});

const fieldLabelStyle = css({
  fontWeight: 500,
  fontSize: "[12px]",
  marginBottom: "[4px]",
});

const simpleStateContainerStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "[8px]",
});

/**
 * PlaceInitialStateContent - Renders the initial state editor for a place.
 * Uses PlacePropertiesContext to access the current place data.
 */
const PlaceInitialStateContent: React.FC = () => {
  const { place, placeType } = usePlacePropertiesContext();

  const simulation = useSimulationStore((state) => state.simulation);
  const initialMarking = useSimulationStore((state) => state.initialMarking);
  const setInitialMarking = useSimulationStore(
    (state) => state.setInitialMarking,
  );
  const currentlyViewedFrame = useSimulationStore(
    (state) => state.currentlyViewedFrame,
  );

  // Determine if simulation is running (has frames)
  const hasSimulationFrames =
    simulation !== null && simulation.frames.length > 0;

  // If no type or type has 0 dimensions, show simple number input
  if (!placeType || placeType.elements.length === 0) {
    // Get token count from simulation frame or initial marking
    let currentTokenCount = 0;
    if (hasSimulationFrames) {
      const currentFrame = simulation.frames[currentlyViewedFrame];
      if (currentFrame) {
        const placeState = currentFrame.places.get(place.id);
        currentTokenCount = placeState?.count ?? 0;
      }
    } else {
      const currentMarking = initialMarking.get(place.id);
      currentTokenCount = currentMarking?.count ?? 0;
    }

    return (
      <div className={simpleStateContainerStyle}>
        <div className={fieldLabelStyle}>Token count</div>
        <input
          type="number"
          min="0"
          step="1"
          value={currentTokenCount}
          onChange={(event) => {
            const count = Math.max(
              0,
              Number.parseInt(event.target.value, 10) || 0,
            );
            setInitialMarking(place.id, {
              values: new Float64Array(0), // Empty array for places without type
              count,
            });
          }}
          disabled={hasSimulationFrames}
          className={inputStyle}
        />
      </div>
    );
  }

  return (
    <InitialStateEditor
      key={place.id}
      placeId={place.id}
      placeType={placeType}
    />
  );
};

/**
 * SubView definition for Place Initial State.
 * Note: This subview requires PlacePropertiesProvider to be in the component tree.
 */
export const placeInitialStateSubView: SubView = {
  id: "place-initial-state",
  title: "State",
  tooltip:
    "Define the initial tokens in this place. During simulation, shows current state.",
  component: PlaceInitialStateContent,
  resizable: {
    defaultHeight: 150,
    minHeight: 80,
    maxHeight: 400,
  },
};
