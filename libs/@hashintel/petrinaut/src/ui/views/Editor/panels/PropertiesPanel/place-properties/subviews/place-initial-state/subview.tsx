import { use } from "react";

import { Form, Icon, NumberInput, Tooltip } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { PlaybackContext } from "../../../../../../../../react/playback/context";
import { SimulationContext } from "../../../../../../../../react/simulation/context";
import { usePlacePropertiesContext } from "../../context";
import { InitialStateEditor } from "./initial-state-editor";

import type { SubView } from "../../../../../../../components/sub-view/types";

// the subview content wrapper has no top padding (it belongs to the sticky
// header), so a lone field provides its own
const stateFieldStyle = css({
  marginTop: "3",
});

const scenarioInfoStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "1.5",
  fontSize: "xs",
  color: "neutral.s100",
  fontStyle: "italic",
  paddingY: "2",
  paddingInlineEnd: "2",
});

const StateHeaderAction: React.FC = () => {
  const { selectedScenarioId } = use(SimulationContext);

  return selectedScenarioId ? (
    <div className={scenarioInfoStyle}>
      <Icon name="layer" size="xs" />
      Defined by scenario
    </div>
  ) : null;
};

const PlaceInitialStateContent: React.FC = () => {
  const { place, placeType } = usePlacePropertiesContext();
  const { initialMarking } = use(SimulationContext);
  const { currentFrameReader, totalFrames } = use(PlaybackContext);
  const hasSimulationFrames = totalFrames > 0;

  if (placeType && placeType.elements.length > 0) {
    return (
      <InitialStateEditor
        key={place.id}
        place={place}
        placeType={placeType}
        readOnly
      />
    );
  }

  const marking = initialMarking[place.id];
  const tokenCount =
    hasSimulationFrames && currentFrameReader
      ? currentFrameReader.getPlaceTokenCount(place.id)
      : typeof marking === "number"
        ? marking
        : 0;

  return (
    <Form.Field
      className={stateFieldStyle}
      label={hasSimulationFrames ? "Current tokens" : "Initial tokens"}
      size="sm"
      disabled
    >
      <Tooltip content="Configure initial tokens in Simulation Settings">
        <NumberInput size="sm" min={0} value={tokenCount} disabled />
      </Tooltip>
    </Form.Field>
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
    "View this place’s tokens. Configure initial tokens in Simulation Settings; during simulation, this shows the current state.",
  component: PlaceInitialStateContent,
  renderHeaderAction: () => <StateHeaderAction />,
  defaultCollapsed: true,
  resizable: {
    minHeight: 250,
    maxHeight: 1200,
    defaultHeight: 300,
  },
};
