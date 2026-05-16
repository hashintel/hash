import { Icon } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import { use } from "react";

import { Button } from "../../../../../../../components/button";
import { NumberInput } from "../../../../../../../components/number-input";
import type { SubView } from "../../../../../../../components/sub-view/types";
import { UI_MESSAGES } from "../../../../../../../constants/ui-messages";
import { PlaybackContext } from "../../../../../../../../react/playback/context";
import { SimulationContext } from "../../../../../../../../react/simulation/context";
import { usePlacePropertiesContext } from "../../context";
import { InitialStateEditor } from "./initial-state-editor";

const fieldLabelStyle = css({
  fontWeight: "medium",
  fontSize: "xs",
  marginBottom: "[4px]",
});

const simpleStateContainerStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "[8px]",
});

const scenarioInfoStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "1.5",
  fontSize: "xs",
  color: "neutral.s100",
  fontStyle: "italic",
  paddingY: "2",
});

/**
 * Header action component for the Clear State button.
 * Only shown when not in simulation mode and there's data to clear.
 */
const ClearStateHeaderAction: React.FC = () => {
  const { place, placeType } = usePlacePropertiesContext();
  const { state, initialMarking, setInitialMarking, selectedScenarioId } =
    use(SimulationContext);
  const isSimulationNotRun = state === "NotRun";

  // Check if there's data to clear
  const currentMarking = initialMarking[place.id];
  const hasData =
    typeof currentMarking === "number"
      ? currentMarking > 0
      : (currentMarking?.length ?? 0) > 0;

  // When a scenario is selected, show a label instead of the clear button.
  if (selectedScenarioId) {
    return (
      <div className={scenarioInfoStyle}>
        <Icon name="layer" size="xs" />
        Defined by scenario
      </div>
    );
  }

  // Hide when simulation has run or when there's no data to clear.
  if (!isSimulationNotRun || !hasData) {
    return null;
  }

  const handleClear = () => {
    setInitialMarking(
      place.id,
      placeType && placeType.elements.length > 0 ? [] : 0,
    );
  };

  return (
    <Button
      onClick={handleClear}
      variant="subtle"
      tone="error"
      size="xxs"
      iconName="trash"
    >
      Clear state
    </Button>
  );
};

/**
 * PlaceInitialStateContent - Renders the initial state editor for a place.
 * Uses PlacePropertiesContext to access the current place data.
 */
const PlaceInitialStateContent: React.FC = () => {
  const { place, placeType } = usePlacePropertiesContext();

  const { initialMarking, setInitialMarking, selectedScenarioId } =
    use(SimulationContext);
  const { currentFrameReader, totalFrames } = use(PlaybackContext);

  // Determine if simulation is running (has frames)
  const hasSimulationFrames = totalFrames > 0;

  // When a scenario is selected, show the computed value (read-only).
  // During simulation, show the actual current frame value.
  if (selectedScenarioId) {
    // Colored places: show the spreadsheet (read-only)
    if (placeType && placeType.elements.length > 0) {
      return (
        <InitialStateEditor
          key={place.id}
          placeId={place.id}
          placeType={placeType}
          readOnly
        />
      );
    }

    // Uncolored places: show token count
    let tokenCount = 0;
    if (hasSimulationFrames && currentFrameReader) {
      tokenCount = currentFrameReader.getPlaceTokenCount(place.id);
    } else {
      const marking = initialMarking[place.id];
      tokenCount = typeof marking === "number" ? marking : 0;
    }

    return (
      <div className={simpleStateContainerStyle}>
        <div className={fieldLabelStyle}>
          {hasSimulationFrames ? "Current tokens" : "Initial tokens"}
        </div>
        <NumberInput
          min={0}
          value={tokenCount}
          disabled
          tooltip="Defined by the selected scenario"
        />
      </div>
    );
  }

  // If no type or type has 0 dimensions, show simple number input
  if (!placeType || placeType.elements.length === 0) {
    // Get token count from simulation frame or initial marking
    let currentTokenCount = 0;
    if (hasSimulationFrames && currentFrameReader) {
      currentTokenCount = currentFrameReader.getPlaceTokenCount(place.id);
    } else {
      const currentMarking = initialMarking[place.id];
      currentTokenCount =
        typeof currentMarking === "number" ? currentMarking : 0;
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
              Number.parseInt(event.target.value, 10) || 0,
            );
            setInitialMarking(place.id, count);
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
  defaultCollapsed: true,
  resizable: {
    minHeight: 250,
    maxHeight: 1200,
    defaultHeight: 300,
  },
};
