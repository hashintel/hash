import { css } from "@hashintel/ds-helpers/css";
import { use } from "react";
import { TbTrash } from "react-icons/tb";

import { NumberInput } from "../../../components/number-input";
import type { SubView } from "../../../components/sub-view/types";
import { UI_MESSAGES } from "../../../constants/ui-messages";
import { PlaybackContext } from "../../../playback/context";
import { SimulationContext } from "../../../simulation/context";
import { InitialStateEditor } from "../panels/PropertiesPanel/initial-state-editor";
import { usePlacePropertiesContext } from "../panels/PropertiesPanel/place-properties-context";

const fieldLabelStyle = css({
  fontWeight: "medium",
  fontSize: "[12px]",
  marginBottom: "[4px]",
});

const simpleStateContainerStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "[8px]",
});

const clearButtonStyle = css({
  fontSize: "[10px]",
  padding: "[1px 4px]",
  border: "[1px solid rgba(0, 0, 0, 0.2)]",
  borderRadius: "[3px]",
  backgroundColor: "[white]",
  cursor: "pointer",
  color: "[#666]",
  display: "flex",
  alignItems: "center",
  gap: "[4px]",
  _hover: {
    backgroundColor: "[rgba(0, 0, 0, 0.03)]",
  },
});

/**
 * Header action component for the Clear State button.
 * Only shown when not in simulation mode and there's data to clear.
 */
const ClearStateHeaderAction: React.FC = () => {
  const { place } = usePlacePropertiesContext();
  const { state, initialMarking, setInitialMarking } = use(SimulationContext);
  const isSimulationNotRun = state === "NotRun";

  // Check if there's data to clear
  const currentMarking = initialMarking.get(place.id);
  const hasData = currentMarking && currentMarking.count > 0;

  // Only show when simulation hasn't run and there's data
  if (!isSimulationNotRun || !hasData) {
    return null;
  }

  const handleClear = () => {
    setInitialMarking(place.id, {
      values: new Float64Array(0),
      count: 0,
    });
  };

  return (
    <button type="button" onClick={handleClear} className={clearButtonStyle}>
      <TbTrash size={12} color="#a72b2bff" />
      Clear state
    </button>
  );
};

/**
 * PlaceInitialStateContent - Renders the initial state editor for a place.
 * Uses PlacePropertiesContext to access the current place data.
 */
const PlaceInitialStateContent: React.FC = () => {
  const { place, placeType } = usePlacePropertiesContext();

  const { simulation, initialMarking, setInitialMarking } =
    use(SimulationContext);
  const { currentFrameIndex } = use(PlaybackContext);

  // Determine if simulation is running (has frames)
  const hasSimulationFrames =
    simulation !== null && simulation.frames.length > 0;
  const frameIndex = currentFrameIndex;

  // If no type or type has 0 dimensions, show simple number input
  if (!placeType || placeType.elements.length === 0) {
    // Get token count from simulation frame or initial marking
    let currentTokenCount = 0;
    if (hasSimulationFrames) {
      const currentFrame = simulation.frames[frameIndex];
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
        <NumberInput
          min={0}
          step={1}
          value={currentTokenCount}
          onChange={(event) => {
            const count = Math.max(
              0,
              Number.parseInt(event.target.value, 10) || 0
            );
            setInitialMarking(place.id, {
              values: new Float64Array(0), // Empty array for places without type
              count,
            });
          }}
          disabled={hasSimulationFrames}
          tooltip={hasSimulationFrames ? UI_MESSAGES.READ_ONLY_MODE : undefined}
        />
      </div>
    );
  }

  return (
    <InitialStateEditor
      key={place.id}
      placeId={place.id}
      placeType={placeType}
      fillContainer
    />
  );
};

/**
 * SubView definition for Place Initial State.
 * Note: This subview requires PlacePropertiesProvider to be in the component tree.
 * The SubView container handles resizing, and InitialStateEditor fills the container height.
 */
export const placeInitialStateSubView: SubView = {
  id: "place-initial-state",
  title: "State",
  tooltip:
    "Define the initial tokens in this place. During simulation, shows current state.",
  component: PlaceInitialStateContent,
  renderHeaderAction: () => <ClearStateHeaderAction />,
  resizable: {
    defaultHeight: 250,
    minHeight: 180,
    maxHeight: 600,
  },
};
