import { use } from "react";

import { Form, Icon, NumberInput, Tooltip } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { ExecutionFrameSourceContext } from "../../../../../../../../react/execution-frame/context";
import { SimulationContext } from "../../../../../../../../react/simulation/context";
import { usePlacePropertiesContext } from "../../context";
import { InitialStateEditor } from "./initial-state-editor";

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

export const StateHeaderAction: React.FC = () => {
  const { selectedScenarioId } = use(SimulationContext);

  return selectedScenarioId ? (
    <div className={scenarioInfoStyle}>
      <Icon name="layer" size="xs" />
      Defined by scenario
    </div>
  ) : null;
};

export const PlaceInitialStateContent: React.FC = () => {
  const { place, placeType } = usePlacePropertiesContext();
  const { initialMarking } = use(SimulationContext);
  const { currentFrameReader, totalFrames } = use(ExecutionFrameSourceContext);
  const hasSimulationFrames = totalFrames > 0;

  if (placeType && placeType.elements.length > 0) {
    return <InitialStateEditor place={place} placeType={placeType} />;
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
        <NumberInput
          size="sm"
          min={0}
          value={tokenCount}
          onChange={() => {}}
          disabled
        />
      </Tooltip>
    </Form.Field>
  );
};
