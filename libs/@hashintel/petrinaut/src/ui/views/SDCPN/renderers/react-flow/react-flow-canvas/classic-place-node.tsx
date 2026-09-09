import { Handle, type NodeProps, Position } from "@xyflow/react";
import { use } from "react";

import { Icon } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { ExecutionFrameSourceContext } from "../../../../../../react/execution-frame/context";
import { SimulationContext } from "../../../../../../react/simulation/context";
import { EditorContext } from "../../../../../../react/state/editor-context";
import { withLabelWrapPoints } from "../../../../../lib/label-wrap-points";
import { useSelectionVariant } from "../../../hooks/use-selection-variant";
import { nodeSurfaceStyle } from "../../../styles/node-surface";
import { handleStyling } from "../../../styles/styling";
import { placeBorderColor, placeFillColor } from "../../../styles/type-colors";
import { PlaceStateTooltip } from "./place-state-tooltip";

import type { PlaceNodeType } from "./react-flow-types";

const containerStyle = css({
  position: "relative",
  height: "full",
});

const placeCircleStyle = css({
  paddingY: "4",
  paddingX: "2",
  borderRadius: "[50%]",
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  alignItems: "center",
  gap: "3",
  minWidth: "0",
  fontSize: "[15px]",
  textAlign: "center",
  lineHeight: "[1.3]",
});

const dynamicsIconStyle = css({
  position: "absolute",
  top: "[25px]",
  left: "[0px]",
  width: "[100%]",
  display: "flex",
  alignItems: "center",
  gap: "4",
  justifyContent: "center",
  color: "blue.s110",
  fontSize: "lg",
});

const labelContainerStyle = css({
  textAlign: "center",
  padding: "[12px 0]",
  lineHeight: "[1.1]",
  maxWidth: "[100%]",
  overflowWrap: "break-word",
  lineClamp: "3",
});

const tokenCountBadgeStyle = css({
  position: "absolute",
  top: "[70%]",
  fontSize: "base",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "neutral.s00",
  backgroundColor: "[black]",
  minWidth: "[26px]",
  height: "[26px]",
  borderRadius: "[13px]",
  padding: "[0 6px]",
  fontWeight: "semibold",
  fontVariantNumeric: "tabular-nums",
});

export const ClassicPlaceNode: React.FC<NodeProps<PlaceNodeType>> = ({
  id,
  data,
  isConnectable,
  selected,
}: NodeProps<PlaceNodeType>) => {
  const { globalMode, isHovered } = use(EditorContext);
  const isSimulateMode = globalMode === "simulate";
  const { initialMarking } = use(SimulationContext);
  const { currentViewedFrame, totalFrames } = use(ExecutionFrameSourceContext);

  // Show the visualizer on hover for places with a visualizer during simulation.
  const showStateTooltip =
    data.hasColorType && data.hasVisualizer && totalFrames > 0 && isHovered(id);

  // Get token count from the currently viewed frame or initial marking
  let tokenCount: number | null = null;
  if (currentViewedFrame) {
    tokenCount = currentViewedFrame.places[id]?.tokenCount ?? null;
  } else if (isSimulateMode) {
    // In simulate mode but no simulation running - show initial marking
    const marking = initialMarking[id];
    tokenCount = typeof marking === "number" ? marking : (marking?.length ?? 0);
  }

  // Wrap points let a long name break inside the circle instead of clipping.
  const label = withLabelWrapPoints(data.label);

  const selectionVariant = useSelectionVariant(id, selected);

  return (
    <div className={containerStyle}>
      {showStateTooltip && <PlaceStateTooltip nodeId={id} />}
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={isConnectable}
        style={handleStyling}
      />
      <div
        className={`${nodeSurfaceStyle({ selection: selectionVariant })} ${placeCircleStyle}`}
        style={{
          borderColor: placeBorderColor(data.typeColor),
          backgroundColor: placeFillColor(data.typeColor),
        }}
      >
        {data.dynamicsEnabled && (
          <div className={dynamicsIconStyle}>
            <Icon name="function" size="sm" />
          </div>
        )}
        <div className={labelContainerStyle}>{label}</div>
        {tokenCount !== null && (
          <div className={tokenCountBadgeStyle}>{tokenCount}</div>
        )}
      </div>
      <Handle
        type="source"
        position={Position.Right}
        isConnectable={isConnectable}
        style={handleStyling}
      />
    </div>
  );
};
