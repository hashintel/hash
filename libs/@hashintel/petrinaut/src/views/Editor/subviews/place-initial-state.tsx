import { css, cva } from "@hashintel/ds-helpers/css";
import { TbTrash } from "react-icons/tb";

import type { SubView } from "../../../components/sub-view/types";
import { useSimulationStore } from "../../../state/simulation-provider";
import { InitialStateEditor } from "../panels/PropertiesPanel/initial-state-editor";
import { usePlacePropertiesContext } from "../panels/PropertiesPanel/place-properties-context";

const inputStyle = cva({
  base: {
    fontSize: "[14px]",
    padding: "[6px 8px]",
    borderRadius: "[4px]",
    width: "[100%]",
    boxSizing: "border-box",
    border: "[1px solid rgba(0, 0, 0, 0.1)]",
  },
  variants: {
    isDisabled: {
      true: {
        backgroundColor: "[rgba(0, 0, 0, 0.05)]",
        cursor: "not-allowed",
      },
      false: {
        backgroundColor: "[white]",
        cursor: "text",
      },
    },
  },
  defaultVariants: {
    isDisabled: false,
  },
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
  const isSimulationNotRun = useSimulationStore(
    (state) => state.state === "NotRun",
  );
  const initialMarking = useSimulationStore((state) => state.initialMarking);
  const setInitialMarking = useSimulationStore(
    (state) => state.setInitialMarking,
  );

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
          className={inputStyle({ isDisabled: hasSimulationFrames })}
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
