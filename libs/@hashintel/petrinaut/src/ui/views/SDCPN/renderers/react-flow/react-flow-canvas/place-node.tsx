import { use } from "react";

import { Icon } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { ExecutionFrameSourceContext } from "../../../../../../react/execution-frame/context";
import { SimulationContext } from "../../../../../../react/simulation/context";
import { EditorContext } from "../../../../../../react/state/editor-context";
import { nodeFocusStyle } from "../../../styles/focus";
import { placeBorderColor, placeFillColor } from "../../../styles/type-colors";
import {
  iconBadgeStyle,
  iconContainerBaseStyle,
  NodeCard,
  nodeCardStyle,
} from "./node-card";
import { PlaceStateTooltip } from "./place-state-tooltip";

import type { PlaceNodeType } from "./react-flow-types";
import type { NodeProps } from "@xyflow/react";

const placeCardStyle = css({
  borderRadius: "full",
});

const placeIconContainerStyle = css({
  borderRadius: "full",
});

const dynamicsBadgeStyle = css({
  color: "blue.s110",
});

const tokenCountBadgeStyle = css({
  position: "absolute",
  top: "[-8px]",
  right: "[-8px]",
  fontSize: "xs",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "neutral.s00",
  backgroundColor: "[black]",
  minWidth: "[20px]",
  height: "[20px]",
  borderRadius: "[10px]",
  padding: "[0 5px]",
  fontWeight: "semibold",
  fontVariantNumeric: "tabular-nums",
});

export const PlaceNode: React.FC<NodeProps<PlaceNodeType>> = ({
  id,
  data,
  isConnectable,
  selected,
}: NodeProps<PlaceNodeType>) => {
  const { globalMode } = use(EditorContext);
  const isSimulateMode = globalMode === "simulate";
  const { initialMarking } = use(SimulationContext);
  const { currentViewedFrame, totalFrames } = use(ExecutionFrameSourceContext);

  // Show the visualizer on hover for places with a visualizer during simulation.
  const showStateTooltip =
    data.hasColorType && data.hasVisualizer && totalFrames > 0 && data.hovered;

  // Get token count from the currently viewed frame or initial marking
  let tokenCount: number | null = null;
  if (currentViewedFrame) {
    tokenCount = currentViewedFrame.places[id]?.tokenCount ?? null;
  } else if (isSimulateMode) {
    // In simulate mode but no simulation running - show initial marking
    const marking = initialMarking[id];
    tokenCount = typeof marking === "number" ? marking : (marking?.length ?? 0);
  }

  // React Flow marks a node selected as a drag-selection is drawn, before the
  // change reaches the editor's own selection.
  const focus = selected ? "focused" : data.focus;

  const subtitle = data.dynamicsEnabled ? "Place (Dynamics)" : "Place";

  const typeColorBorder = placeBorderColor(data.typeColor);

  const placeBackgroundColor = placeFillColor(data.typeColor);

  return (
    <>
      {showStateTooltip && <PlaceStateTooltip nodeId={id} />}
      <NodeCard
        cardClassName={`${nodeCardStyle} ${placeCardStyle} ${nodeFocusStyle({ focus })}`}
        cardStyle={{
          borderColor: typeColorBorder,
          backgroundColor: placeBackgroundColor,
        }}
        iconContainer={
          <div
            className={`${iconContainerBaseStyle} ${placeIconContainerStyle}`}
            style={{ color: typeColorBorder }}
          >
            <Icon name="circleFilled" />
            {data.dynamicsEnabled && (
              <div className={`${iconBadgeStyle} ${dynamicsBadgeStyle}`}>
                <Icon name="function" size="xs" />
              </div>
            )}
          </div>
        }
        title={data.label}
        subtitle={subtitle}
        badge={
          tokenCount !== null ? (
            <div className={tokenCountBadgeStyle}>{tokenCount}</div>
          ) : undefined
        }
        isConnectable={isConnectable}
      />
    </>
  );
};
